"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
}

export function NewInvoiceForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientId) {
      setError("Pick a client first");
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Failed to create invoice");
        return;
      }
      router.push(`/invoices/${data.invoice.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          You need at least one client before creating an invoice.{" "}
          <a href="/clients/new" className="underline">
            Add a client
          </a>
          .
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="client">Client</Label>
            <Select value={clientId} onValueChange={(v) => v && setClientId(v)}>
              <SelectTrigger id="client" className="w-full">
                <SelectValue placeholder="Select a client">
                  {(value: string | null) => {
                    const client = clients.find((c) => c.id === value);
                    return client ? client.name : null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` (${c.company})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={isCreating} className="self-start">
            {isCreating ? "Creating..." : "Create Draft"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
