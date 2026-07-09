"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { BusinessProfileInput } from "@/lib/validations/business-profile";

type ProfileFormState = {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  email: string;
  phone: string;
  logoUrl: string;
  signatureUrl: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
  invoiceNumberFormat: string;
  brandColor: string;
  defaultTemplateId: "CHARCOAL" | "CLASSIC";
  defaultTaxRatePercent: string;
  defaultDueDays: string;
  defaultTermsText: string;
  defaultNotesText: string;
  exportDeclarationText: string;
};

type StoredProfile = Partial<ProfileFormState> & { id?: string };

const EMPTY_STATE: ProfileFormState = {
  legalName: "",
  tradeName: "",
  gstin: "",
  pan: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  stateCode: "",
  pincode: "",
  email: "",
  phone: "",
  logoUrl: "",
  signatureUrl: "",
  bankName: "",
  accountNumber: "",
  ifsc: "",
  upiId: "",
  invoiceNumberFormat: "TG/{FY}/{seq}",
  brandColor: "#10B981",
  defaultTemplateId: "CHARCOAL",
  defaultTaxRatePercent: "18",
  defaultDueDays: "15",
  defaultTermsText: "",
  defaultNotesText: "",
  exportDeclarationText:
    "Supply meant for export under LUT without payment of IGST",
};

function toFormState(profile: StoredProfile | null): ProfileFormState {
  if (!profile) return EMPTY_STATE;
  return { ...EMPTY_STATE, ...profile };
}

export function SettingsForm({
  initialProfile,
}: {
  initialProfile: StoredProfile | null;
}) {
  const [form, setForm] = useState<ProfileFormState>(
    toFormState(initialProfile),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<
    "logoUrl" | "signatureUrl" | null
  >(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof ProfileFormState>(
    key: K,
    value: ProfileFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileUpload(
    event: ChangeEvent<HTMLInputElement>,
    field: "logoUrl" | "signatureUrl",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingField(field);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/settings/upload", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error ?? "Upload failed");
        return;
      }
      update(field, data.url as string);
    } finally {
      setUploadingField(null);
      event.target.value = "";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload: BusinessProfileInput = {
      legalName: form.legalName,
      tradeName: form.tradeName || undefined,
      gstin: form.gstin || undefined,
      pan: form.pan || undefined,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2 || undefined,
      city: form.city,
      state: form.state,
      stateCode: form.stateCode,
      pincode: form.pincode,
      email: form.email,
      phone: form.phone,
      logoUrl: form.logoUrl || undefined,
      signatureUrl: form.signatureUrl || undefined,
      bankName: form.bankName || undefined,
      accountNumber: form.accountNumber || undefined,
      ifsc: form.ifsc || undefined,
      upiId: form.upiId || undefined,
      invoiceNumberFormat: form.invoiceNumberFormat,
      brandColor: form.brandColor,
      defaultTemplateId: form.defaultTemplateId,
      defaultTaxRatePercent: Number(form.defaultTaxRatePercent),
      defaultDueDays: Number(form.defaultDueDays),
      defaultTermsText: form.defaultTermsText || undefined,
      defaultNotesText: form.defaultNotesText || undefined,
      exportDeclarationText: form.exportDeclarationText || undefined,
    };

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(describeApiError(data));
        return;
      }
      setSuccessMessage("Saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
          <CardDescription>
            Legal identity used on invoices and GST filings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" htmlFor="legalName" required>
            <Input
              id="legalName"
              required
              value={form.legalName}
              onChange={(e) => update("legalName", e.target.value)}
            />
          </Field>
          <Field label="Trade name" htmlFor="tradeName">
            <Input
              id="tradeName"
              value={form.tradeName}
              onChange={(e) => update("tradeName", e.target.value)}
            />
          </Field>
          <Field label="GSTIN" htmlFor="gstin">
            <Input
              id="gstin"
              value={form.gstin}
              placeholder="e.g. 27AAAAA0000A1Z5"
              onChange={(e) => update("gstin", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="PAN" htmlFor="pan">
            <Input
              id="pan"
              value={form.pan}
              onChange={(e) => update("pan", e.target.value.toUpperCase())}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1" htmlFor="addressLine1" required>
            <Input
              id="addressLine1"
              required
              value={form.addressLine1}
              onChange={(e) => update("addressLine1", e.target.value)}
            />
          </Field>
          <Field label="Address line 2" htmlFor="addressLine2">
            <Input
              id="addressLine2"
              value={form.addressLine2}
              onChange={(e) => update("addressLine2", e.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="city" required>
            <Input
              id="city"
              required
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
            />
          </Field>
          <Field label="State" htmlFor="stateCode" required>
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
          <Field label="Pincode" htmlFor="pincode" required>
            <Input
              id="pincode"
              required
              inputMode="numeric"
              value={form.pincode}
              onChange={(e) => update("pincode", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="phone" required>
            <Input
              id="phone"
              required
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo &amp; Signature</CardTitle>
          <CardDescription>PNG, JPEG, WebP, or SVG, up to 5MB.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Logo</Label>
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded file, not build-time known
              <img
                src={form.logoUrl}
                alt="Business logo"
                width={120}
                height={120}
                className="rounded-md border border-border bg-white object-contain p-2"
              />
            ) : null}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "logoUrl")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingField === "logoUrl"}
              onClick={() => logoInputRef.current?.click()}
            >
              {uploadingField === "logoUrl" ? "Uploading..." : "Upload logo"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Signature</Label>
            {form.signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded file, not build-time known
              <img
                src={form.signatureUrl}
                alt="Signature"
                width={120}
                height={120}
                className="rounded-md border border-border bg-white object-contain p-2"
              />
            ) : null}
            <input
              ref={signatureInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "signatureUrl")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingField === "signatureUrl"}
              onClick={() => signatureInputRef.current?.click()}
            >
              {uploadingField === "signatureUrl"
                ? "Uploading..."
                : "Upload signature"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank name" htmlFor="bankName">
            <Input
              id="bankName"
              value={form.bankName}
              onChange={(e) => update("bankName", e.target.value)}
            />
          </Field>
          <Field label="Account number" htmlFor="accountNumber">
            <Input
              id="accountNumber"
              value={form.accountNumber}
              onChange={(e) => update("accountNumber", e.target.value)}
            />
          </Field>
          <Field label="IFSC" htmlFor="ifsc">
            <Input
              id="ifsc"
              value={form.ifsc}
              onChange={(e) => update("ifsc", e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="UPI ID" htmlFor="upiId">
            <Input
              id="upiId"
              value={form.upiId}
              onChange={(e) => update("upiId", e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice number format" htmlFor="invoiceNumberFormat">
            <Input
              id="invoiceNumberFormat"
              value={form.invoiceNumberFormat}
              onChange={(e) => update("invoiceNumberFormat", e.target.value)}
            />
          </Field>
          <Field label="Default template" htmlFor="defaultTemplateId">
            <Select
              value={form.defaultTemplateId}
              onValueChange={(value) =>
                update("defaultTemplateId", value as "CHARCOAL" | "CLASSIC")
              }
            >
              <SelectTrigger id="defaultTemplateId" className="w-full">
                <SelectValue>
                  {(value: "CHARCOAL" | "CLASSIC" | null) =>
                    value === "CLASSIC" ? "Classic (light)" : "Charcoal (dark)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CHARCOAL">Charcoal (dark)</SelectItem>
                <SelectItem value="CLASSIC">Classic (light)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Default tax rate (%)" htmlFor="defaultTaxRatePercent">
            <Input
              id="defaultTaxRatePercent"
              type="number"
              min={0}
              max={100}
              value={form.defaultTaxRatePercent}
              onChange={(e) =>
                update("defaultTaxRatePercent", e.target.value)
              }
            />
          </Field>
          <Field label="Default due days" htmlFor="defaultDueDays">
            <Input
              id="defaultDueDays"
              type="number"
              min={0}
              max={365}
              value={form.defaultDueDays}
              onChange={(e) => update("defaultDueDays", e.target.value)}
            />
          </Field>
          <Field label="Brand color" htmlFor="brandColor">
            <div className="flex items-center gap-2">
              <input
                id="brandColor"
                type="color"
                value={form.brandColor}
                onChange={(e) => update("brandColor", e.target.value)}
                className="h-9 w-12 rounded border border-input bg-transparent"
              />
              <Input
                value={form.brandColor}
                onChange={(e) => update("brandColor", e.target.value)}
                className="w-32"
              />
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Separator />
          </div>
          <Field
            label="Default terms"
            htmlFor="defaultTermsText"
            className="sm:col-span-2"
          >
            <Textarea
              id="defaultTermsText"
              rows={3}
              value={form.defaultTermsText}
              onChange={(e) => update("defaultTermsText", e.target.value)}
            />
          </Field>
          <Field
            label="Default notes"
            htmlFor="defaultNotesText"
            className="sm:col-span-2"
          >
            <Textarea
              id="defaultNotesText"
              rows={3}
              value={form.defaultNotesText}
              onChange={(e) => update("defaultNotesText", e.target.value)}
            />
          </Field>
          <Field
            label="Export declaration text"
            htmlFor="exportDeclarationText"
            className="sm:col-span-2"
          >
            <Textarea
              id="exportDeclarationText"
              rows={2}
              value={form.exportDeclarationText}
              onChange={(e) =>
                update("exportDeclarationText", e.target.value)
              }
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save settings"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-sm text-emerald-400">{successMessage}</p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
