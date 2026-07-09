import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientForm } from "@/components/client-form";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit Client
        </h1>
        <p className="text-sm text-muted-foreground">{client.name}</p>
      </div>
      <ClientForm
        clientId={client.id}
        initialClient={{
          name: client.name,
          company: client.company ?? "",
          email: client.email ?? "",
          phone: client.phone ?? "",
          gstin: client.gstin ?? "",
          billingAddressLine1: client.billingAddressLine1 ?? "",
          billingAddressLine2: client.billingAddressLine2 ?? "",
          city: client.city ?? "",
          state: client.state ?? "",
          stateCode: client.stateCode ?? "",
          pincode: client.pincode ?? "",
          currency: client.currency,
          notes: client.notes ?? "",
        }}
      />
    </div>
  );
}
