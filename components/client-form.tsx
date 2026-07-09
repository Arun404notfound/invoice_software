"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GST_STATES } from "@/lib/constants/gst-states";
import { describeApiError } from "@/lib/utils";
import type { ClientInput } from "@/lib/validations/client";

type ClientFormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  gstin: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  currency: string;
  notes: string;
};

const EMPTY_STATE: ClientFormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  gstin: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
  currency: "INR",
  notes: "",
};

export function ClientForm({
  clientId,
  initialClient,
}: {
  clientId?: string;
  initialClient?: Partial<ClientFormState> | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ClientFormState>({
    ...EMPTY_STATE,
    ...initialClient,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof ClientFormState>(
    key: K,
    value: ClientFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: ClientInput = {
      name: form.name,
      company: form.company || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      gstin: form.gstin || undefined,
      billingAddressLine1: form.billingAddressLine1 || undefined,
      billingAddressLine2: form.billingAddressLine2 || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      stateCode: form.stateCode || undefined,
      pincode: form.pincode || undefined,
      currency: form.currency,
      notes: form.notes || undefined,
    };

    try {
      const response = await fetch(
        clientId ? `/api/clients/${clientId}` : "/api/clients",
        {
          method: clientId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(describeApiError(data));
        return;
      }
      router.push("/clients");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Company" htmlFor="company">
            <Input
              id="company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>
          <Field label="GSTIN" htmlFor="gstin">
            <Input
              id="gstin"
              value={form.gstin}
              placeholder="Leave blank if unregistered / international"
              onChange={(e) => update("gstin", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Input
              id="currency"
              value={form.currency}
              onChange={(e) => update("currency", e.target.value.toUpperCase())}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="billingAddressLine1">
            <Input
              id="billingAddressLine1"
              value={form.billingAddressLine1}
              onChange={(e) => update("billingAddressLine1", e.target.value)}
            />
          </Field>
          <Field label="Address line 2" htmlFor="billingAddressLine2">
            <Input
              id="billingAddressLine2"
              value={form.billingAddressLine2}
              onChange={(e) => update("billingAddressLine2", e.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="city">
            <Input
              id="city"
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </Field>
          <Field label="State" htmlFor="stateCode">
            <Select
              value={form.stateCode}
              onValueChange={(value) => {
                if (!value) return;
                const state = GST_STATES.find((s) => s.code === value);
                update("stateCode", value);
                if (state) update("state", state.name);
              }}
            >
              <SelectTrigger id="stateCode" className="w-full">
                <SelectValue placeholder="Select state">
                  {(value: string | null) => {
                    const state = GST_STATES.find((s) => s.code === value);
                    return state ? `${state.code} — ${state.name}` : null;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GST_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Pincode" htmlFor="pincode">
            <Input
              id="pincode"
              inputMode="numeric"
              value={form.pincode}
              onChange={(e) => update("pincode", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : clientId ? "Save changes" : "Create client"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
