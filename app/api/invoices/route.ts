import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { createInvoiceSchema } from "@/lib/validations/invoice";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      number: true,
      status: true,
      totalPaise: true,
      amountPaidPaise: true,
      dueDate: true,
      createdAt: true,
      client: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invoices });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: parsed.data.clientId },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const businessProfile = await prisma.businessProfile.findFirst();
  if (!businessProfile) {
    return NextResponse.json(
      { error: "Set up your business profile under Settings first" },
      { status: 400 },
    );
  }

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + businessProfile.defaultDueDays);

  const invoice = await prisma.invoice.create({
    data: {
      clientId: client.id,
      status: "DRAFT",
      issueDate,
      dueDate,
      placeOfSupplyStateCode: client.stateCode ?? businessProfile.stateCode,
      currency: client.currency,
      subtotalPaise: 0,
      discountPaise: 0,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      roundOffPaise: 0,
      totalPaise: 0,
      amountPaidPaise: 0,
      notes: businessProfile.defaultNotesText,
      terms: businessProfile.defaultTermsText,
    },
  });

  await prisma.activityLog.create({
    data: {
      entityType: "Invoice",
      entityId: invoice.id,
      action: "CREATE",
      afterJson: JSON.parse(JSON.stringify(invoice)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ invoice }, { status: 201 });
}
