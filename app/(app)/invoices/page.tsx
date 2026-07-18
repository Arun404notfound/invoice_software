import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { formatINR } from "@/lib/money";

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      number: true,
      status: true,
      totalPaise: true,
      dueDate: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Draft, finalize, and track invoices.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/invoices/new" />}>
          New Invoice
        </Button>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invoices yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="hover:underline"
                    >
                      {invoice.number ?? "Draft"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {invoice.client.name}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(invoice.dueDate)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatINR(invoice.totalPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
