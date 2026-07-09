import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/clients-table";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "true";

  const clients = await prisma.client.findMany({
    where: { isArchived: showArchived },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Everyone you bill invoices to.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/clients/new" />}>
          New Client
        </Button>
      </div>

      <div className="flex gap-2 text-sm">
        <Link
          href="/clients"
          className={
            !showArchived
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }
        >
          Active
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          href="/clients?archived=true"
          className={
            showArchived
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }
        >
          Archived
        </Link>
      </div>

      <ClientsTable clients={clients} />
    </div>
  );
}
