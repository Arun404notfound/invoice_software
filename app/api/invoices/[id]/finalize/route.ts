import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition, InvalidInvoiceTransitionError } from "@/lib/invoice-state-machine";
import { generateInvoiceNumber } from "@/lib/invoice-number";

/**
 * Locks in a Draft invoice: allocates its real, never-reused invoice
 * number and moves it out of Draft so it can no longer be edited. This is
 * the only place `Invoice.number` gets assigned -- deliberately not called
 * "send", since this app has no outbound email step; the resulting PDF is
 * downloaded and shared manually.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.invoice.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    assertTransition(existing.status, "SENT");
  } catch (error) {
    if (error instanceof InvalidInvoiceTransitionError) {
      return NextResponse.json(
        { error: "Only Draft invoices can be finalized" },
        { status: 400 },
      );
    }
    throw error;
  }

  const businessProfile = await prisma.businessProfile.findFirst();
  if (!businessProfile) {
    return NextResponse.json(
      { error: "Set up your business profile under Settings first" },
      { status: 400 },
    );
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const { number, financialYear } = await generateInvoiceNumber(
      tx,
      businessProfile.invoiceNumberFormat,
    );
    return tx.invoice.update({
      where: { id },
      data: {
        number,
        financialYear,
        status: "SENT",
        sentAt: new Date(),
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, client: true },
    });
  });

  await prisma.activityLog.create({
    data: {
      entityType: "Invoice",
      entityId: invoice.id,
      action: "FINALIZE",
      beforeJson: { status: existing.status, number: existing.number },
      afterJson: { status: invoice.status, number: invoice.number },
      actorId: user.id,
    },
  });

  return NextResponse.json({ invoice });
}
