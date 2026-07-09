import { prisma } from "@/lib/prisma";
import { NewInvoiceForm } from "@/components/new-invoice-form";

export default async function NewInvoicePage() {
  const clients = await prisma.client.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, company: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Invoice
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick a client to start a draft. You&apos;ll add line items next.
        </p>
      </div>
      <NewInvoiceForm clients={clients} />
    </div>
  );
}
