import { ClientForm } from "@/components/client-form";

export default function NewClientPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Client</h1>
        <p className="text-sm text-muted-foreground">
          Add a client to bill invoices to.
        </p>
      </div>
      <ClientForm />
    </div>
  );
}
