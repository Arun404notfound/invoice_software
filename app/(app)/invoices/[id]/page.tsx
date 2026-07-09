import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InvoiceBuilder } from "@/components/invoice-builder";

export default async function InvoiceBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [invoice, clients, businessProfile] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        lineItems: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { paidAt: "desc" } },
      },
    }),
    prisma.client.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, company: true, stateCode: true, currency: true },
      orderBy: { name: "asc" },
    }),
    prisma.businessProfile.findFirst(),
  ]);

  if (!invoice) {
    notFound();
  }
  if (!businessProfile) {
    notFound();
  }

  return (
    <InvoiceBuilder
      invoice={JSON.parse(JSON.stringify(invoice))}
      clients={clients}
      sellerStateCode={businessProfile.stateCode}
      defaultTaxRatePercent={businessProfile.defaultTaxRatePercent}
    />
  );
}
