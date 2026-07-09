"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface ClientRow {
  id: string;
  name: string;
  company: string | null;
  gstin: string | null;
  city: string | null;
  state: string | null;
  isArchived: boolean;
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggleArchive(client: ClientRow) {
    setPendingId(client.id);
    try {
      await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isArchived: !client.isArchived }),
      });
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No clients to show.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium">GSTIN</th>
            <th className="px-4 py-2 font-medium">Location</th>
            <th className="px-4 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <Link
                  href={`/clients/${client.id}/edit`}
                  className="hover:underline"
                >
                  {client.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {client.company ?? "—"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {client.gstin ?? "—"}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {[client.city, client.state].filter(Boolean).join(", ") || "—"}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pendingId === client.id}
                  onClick={() => toggleArchive(client)}
                >
                  {client.isArchived ? "Unarchive" : "Archive"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
