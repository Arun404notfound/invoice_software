import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { invoiceSchema } from "@/lib/validations/invoice";
import { calculateInvoice } from "@/lib/invoice-calc";
import { rupeesToPaise } from "@/lib/money";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ invoice });
}

export async function PUT(
  request: Request,
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
  if (existing.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Only Draft invoices can be edited" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invoice", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const [client, businessProfile] = await Promise.all([
    prisma.client.findUnique({ where: { id: input.clientId } }),
    prisma.businessProfile.findFirst(),
  ]);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  if (!businessProfile) {
    return NextResponse.json(
      { error: "Set up your business profile under Settings first" },
      { status: 400 },
    );
  }

  let calc;
  try {
    calc = calculateInvoice({
      sellerStateCode: businessProfile.stateCode,
      placeOfSupplyStateCode: input.placeOfSupplyStateCode,
      isExport: input.isExport,
      overallDiscountPaise: rupeesToPaise(input.overallDiscount),
      lineItems: input.lineItems.map((li) => ({
        quantity: li.quantity,
        ratePaise: rupeesToPaise(li.rate),
        discountPercent: li.discountPercent,
        taxRatePercent: li.taxRatePercent,
      })),
    });
  } catch (error) {
    const message = error instanceof RangeError ? error.message : "Invalid invoice totals";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const invoice = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });

    await tx.invoiceLineItem.createMany({
      data: input.lineItems.map((li, index) => ({
        invoiceId: id,
        description: li.description,
        hsnSacCode: li.hsnSacCode,
        quantity: li.quantity,
        unit: li.unit,
        ratePaise: rupeesToPaise(li.rate),
        discountPercent: li.discountPercent,
        taxRatePercent: li.taxRatePercent,
        taxableValuePaise: calc.lineItems[index].taxableValuePaise,
        lineTotalPaise: calc.lineItems[index].lineTotalPaise,
        sortOrder: index,
      })),
    });

    return tx.invoice.update({
      where: { id },
      data: {
        clientId: input.clientId,
        issueDate: new Date(input.issueDate),
        dueDate: new Date(input.dueDate),
        placeOfSupplyStateCode: input.placeOfSupplyStateCode,
        isExport: input.isExport,
        notes: input.notes,
        terms: input.terms,
        subtotalPaise: calc.subtotalPaise,
        discountPaise: calc.discountPaise,
        cgstPaise: calc.cgstPaise,
        sgstPaise: calc.sgstPaise,
        igstPaise: calc.igstPaise,
        roundOffPaise: calc.roundOffPaise,
        totalPaise: calc.totalPaise,
      },
      include: { lineItems: { orderBy: { sortOrder: "asc" } }, client: true },
    });
  });

  await prisma.activityLog.create({
    data: {
      entityType: "Invoice",
      entityId: invoice.id,
      action: "UPDATE",
      beforeJson: JSON.parse(JSON.stringify(existing)),
      afterJson: JSON.parse(JSON.stringify(invoice)),
      actorId: user.id,
    },
  });

  return NextResponse.json({ invoice });
}
