"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StatusBadge } from "@/components/status-badge";
import { GST_STATES } from "@/lib/constants/gst-states";
import { SAC_CODE_SUGGESTIONS, UNIT_SUGGESTIONS } from "@/lib/constants/service-presets";
import { calculateInvoice } from "@/lib/invoice-calc";
import { rupeesToPaise, formatINR } from "@/lib/money";
import { describeApiError } from "@/lib/utils";
import type { InvoiceInput } from "@/lib/validations/invoice";
import { Trash2, Plus } from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
  company: string | null;
  stateCode: string | null;
  currency: string;
}

interface SerializedLineItem {
  id: string;
  description: string;
  hsnSacCode: string;
  quantity: string;
  unit: string;
  ratePaise: number;
  discountPercent: string;
  taxRatePercent: string;
}

interface SerializedInvoice {
  id: string;
  number: string | null;
  status: "DRAFT" | "SENT" | "VIEWED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "OVERDUE";
  issueDate: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  isExport: boolean;
  notes: string | null;
  terms: string | null;
  discountPaise: number;
  totalPaise: number;
  client: { id: string; name: string };
  lineItems: SerializedLineItem[];
}

interface LineItemRow {
  key: string;
  description: string;
  hsnSacCode: string;
  quantity: string;
  unit: string;
  rate: string;
  discountPercent: string;
  taxRatePercent: string;
}

function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

function blankRow(taxRatePercent: string): LineItemRow {
  return {
    key: crypto.randomUUID(),
    description: "",
    hsnSacCode: "",
    quantity: "1",
    unit: "Hours",
    rate: "",
    discountPercent: "0",
    taxRatePercent,
  };
}

export function InvoiceBuilder({
  invoice,
  clients,
  sellerStateCode,
  defaultTaxRatePercent,
}: {
  invoice: SerializedInvoice;
  clients: ClientOption[];
  sellerStateCode: string;
  defaultTaxRatePercent: number;
}) {
  const router = useRouter();
  const isReadOnly = invoice.status !== "DRAFT";
  const defaultTaxRate = String(defaultTaxRatePercent);

  const [clientId, setClientId] = useState(invoice.client.id);
  const [issueDate, setIssueDate] = useState(invoice.issueDate.slice(0, 10));
  const [dueDate, setDueDate] = useState(invoice.dueDate.slice(0, 10));
  const [placeOfSupplyStateCode, setPlaceOfSupplyStateCode] = useState(
    invoice.placeOfSupplyStateCode,
  );
  const [isExport, setIsExport] = useState(invoice.isExport);
  const [overallDiscount, setOverallDiscount] = useState(
    paiseToRupeeString(invoice.discountPaise),
  );
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [terms, setTerms] = useState(invoice.terms ?? "");
  const [lineItems, setLineItems] = useState<LineItemRow[]>(() =>
    invoice.lineItems.length > 0
      ? invoice.lineItems.map((li) => ({
          key: li.id,
          description: li.description,
          hsnSacCode: li.hsnSacCode,
          quantity: li.quantity,
          unit: li.unit,
          rate: paiseToRupeeString(li.ratePaise),
          discountPercent: li.discountPercent,
          taxRatePercent: li.taxRatePercent,
        }))
      : [blankRow(defaultTaxRate)],
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isConfirmingFinalize, setIsConfirmingFinalize] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const calc = useMemo(() => {
    try {
      return calculateInvoice({
        sellerStateCode,
        placeOfSupplyStateCode,
        isExport,
        overallDiscountPaise: rupeesToPaise(overallDiscount || "0"),
        lineItems: lineItems.map((li) => ({
          quantity: li.quantity || "0",
          ratePaise: rupeesToPaise(li.rate || "0"),
          discountPercent: li.discountPercent || "0",
          taxRatePercent: li.taxRatePercent || "0",
        })),
      });
    } catch {
      return null;
    }
  }, [sellerStateCode, placeOfSupplyStateCode, isExport, overallDiscount, lineItems]);

  function updateLineItem<K extends keyof LineItemRow>(
    key: string,
    field: K,
    value: LineItemRow[K],
  ) {
    setLineItems((rows) =>
      rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function addLineItem() {
    setLineItems((rows) => [...rows, blankRow(defaultTaxRate)]);
  }

  function removeLineItem(key: string) {
    setLineItems((rows) =>
      rows.length > 1 ? rows.filter((r) => r.key !== key) : rows,
    );
  }

  function moveLineItem(key: string, direction: -1 | 1) {
    setLineItems((rows) => {
      const index = rows.findIndex((r) => r.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function buildPayload(): InvoiceInput {
    return {
      clientId,
      issueDate,
      dueDate,
      placeOfSupplyStateCode,
      isExport,
      overallDiscount: overallDiscount || "0",
      notes: notes || undefined,
      terms: terms || undefined,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        hsnSacCode: li.hsnSacCode,
        quantity: li.quantity,
        unit: li.unit,
        rate: li.rate || "0",
        discountPercent: li.discountPercent || "0",
        taxRatePercent: li.taxRatePercent || "0",
      })),
    };
  }

  async function handleSaveDraft() {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(describeApiError(data));
        return;
      }
      setSuccessMessage("Draft saved.");
      router.refresh();
    } catch {
      setError("Something went wrong while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handlePreviewPdf() {
    window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
  }

  async function handleFinalize() {
    setIsFinalizing(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/finalize`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(describeApiError(data));
        return;
      }
      setSuccessMessage("Invoice finalized.");
      router.refresh();
    } catch {
      setError("Something went wrong while finalizing. Please try again.");
    } finally {
      setIsConfirmingFinalize(false);
      setIsFinalizing(false);
    }
  }

  async function handleSignPdf() {
    setIsSigning(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const prepareResponse = await fetch(
        `/api/invoices/${invoice.id}/sign/prepare`,
        { method: "POST" },
      );
      const prepareData = await prepareResponse.json();
      if (!prepareResponse.ok) {
        setError(describeApiError(prepareData));
        return;
      }
      const { sessionId, digestBase64, signingTime } = prepareData as {
        sessionId: string;
        digestBase64: string;
        signingTime: string;
      };

      const signerUrl =
        process.env.NEXT_PUBLIC_DSC_SIGNER_URL ?? "http://127.0.0.1:7734";
      let signResult: {
        signatureBase64: string;
        signerName?: string;
        signerCertSubject?: string;
      };
      try {
        const signResponse = await fetch(`${signerUrl}/sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ digestBase64, signingTime }),
        });
        if (!signResponse.ok) {
          const signError = await signResponse.json().catch(() => null);
          setError(
            signError?.error ??
              "The local DSC signer rejected the signing request.",
          );
          return;
        }
        signResult = await signResponse.json();
      } catch {
        setError(
          "Couldn't reach the local DSC signer at " +
            signerUrl +
            ". Make sure it's running and your token is plugged in.",
        );
        return;
      }

      const completeResponse = await fetch(
        `/api/invoices/${invoice.id}/sign/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, ...signResult }),
        },
      );
      if (!completeResponse.ok) {
        const completeData = await completeResponse.json().catch(() => null);
        setError(describeApiError(completeData));
        return;
      }

      const blob = await completeResponse.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(invoice.number ?? "draft").replace(/\//g, "-")}-signed.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      setSuccessMessage("Invoice signed and downloaded.");
    } catch {
      setError("Something went wrong while signing. Please try again.");
    } finally {
      setIsSigning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {invoice.number ?? "Draft Invoice"}
          </h1>
          <p className="text-sm text-muted-foreground">{invoice.client.name}</p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Client" htmlFor="clientId">
            <Select
              value={clientId}
              onValueChange={(v) => {
                if (!v || isReadOnly) return;
                setClientId(v);
                const client = clients.find((c) => c.id === v);
                if (client?.stateCode) setPlaceOfSupplyStateCode(client.stateCode);
              }}
            >
              <SelectTrigger id="clientId" className="w-full" disabled={isReadOnly}>
                <SelectValue>
                  {(value: string | null) =>
                    clients.find((c) => c.id === value)?.name ?? invoice.client.name
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Issue date" htmlFor="issueDate">
            <Input
              id="issueDate"
              type="date"
              value={issueDate}
              disabled={isReadOnly}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </Field>
          <Field label="Due date" htmlFor="dueDate">
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              disabled={isReadOnly}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
          <Field
            label="Place of supply"
            htmlFor="placeOfSupplyStateCode"
            caption="Your client's registered state — sets whether you charge CGST+SGST or IGST. Not a delivery address."
          >
            <Select
              value={placeOfSupplyStateCode}
              onValueChange={(v) => v && !isReadOnly && setPlaceOfSupplyStateCode(v)}
            >
              <SelectTrigger
                id="placeOfSupplyStateCode"
                className="w-full"
                disabled={isReadOnly}
              >
                <SelectValue>
                  {(value: string | null) => {
                    const s = GST_STATES.find((s) => s.code === value);
                    return s ? `${s.code} — ${s.name}` : null;
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
          <div className="flex items-center gap-2 self-end pb-1.5">
            <Checkbox
              id="isExport"
              checked={isExport}
              disabled={isReadOnly}
              onCheckedChange={(checked) => setIsExport(checked === true)}
            />
            <Label htmlFor="isExport" className="font-normal">
              Export of Services (0% IGST)
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Description</th>
                  <th className="px-2 py-1 font-medium">SAC Code</th>
                  <th className="px-2 py-1 font-medium">Qty</th>
                  <th className="px-2 py-1 font-medium">Unit</th>
                  <th className="px-2 py-1 font-medium">Rate (₹)</th>
                  <th className="px-2 py-1 font-medium">Disc %</th>
                  <th className="px-2 py-1 font-medium">Tax %</th>
                  {!isReadOnly ? <th className="px-2 py-1"></th> : null}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row, index) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className="px-2 py-1">
                      <Input
                        value={row.description}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "description", e.target.value)
                        }
                        className="min-w-[160px]"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.hsnSacCode}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "hsnSacCode", e.target.value)
                        }
                        list="sac-code-suggestions"
                        placeholder="998314"
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.quantity}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "quantity", e.target.value)
                        }
                        className="w-20"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.unit}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "unit", e.target.value)
                        }
                        list="unit-suggestions"
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.rate}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "rate", e.target.value)
                        }
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.discountPercent}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "discountPercent", e.target.value)
                        }
                        className="w-16"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input
                        value={row.taxRatePercent}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          updateLineItem(row.key, "taxRatePercent", e.target.value)
                        }
                        className="w-16"
                      />
                    </td>
                    {!isReadOnly ? (
                      <td className="flex items-center gap-1 px-2 py-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === 0}
                          onClick={() => moveLineItem(row.key, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={index === lineItems.length - 1}
                          onClick={() => moveLineItem(row.key, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeLineItem(row.key)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <datalist id="sac-code-suggestions">
            {SAC_CODE_SUGGESTIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </datalist>
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          {!isReadOnly ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={addLineItem}
              >
                <Plus className="size-3.5" /> Add line
              </Button>
              <p className="text-xs text-muted-foreground">
                SAC Code suggestions are common codes for software services —
                confirm the exact code with your CA/GST practitioner.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discount, Notes &amp; Terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Overall discount (₹)" htmlFor="overallDiscount">
            <Input
              id="overallDiscount"
              value={overallDiscount}
              disabled={isReadOnly}
              onChange={(e) => setOverallDiscount(e.target.value)}
            />
          </Field>
          <div />
          <Field label="Notes" htmlFor="notes">
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              disabled={isReadOnly}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field label="Terms" htmlFor="terms">
            <Textarea
              id="terms"
              rows={3}
              value={terms}
              disabled={isReadOnly}
              onChange={(e) => setTerms(e.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent>
          {calc ? (
            <table className="ml-auto w-64 text-sm">
              <tbody>
                <tr>
                  <td className="py-1 text-muted-foreground">Subtotal</td>
                  <td className="py-1 text-right">{formatINR(calc.subtotalPaise)}</td>
                </tr>
                {calc.discountPaise > 0 ? (
                  <tr>
                    <td className="py-1 text-muted-foreground">Discount</td>
                    <td className="py-1 text-right">
                      -{formatINR(calc.discountPaise)}
                    </td>
                  </tr>
                ) : null}
                {calc.cgstPaise > 0 || calc.sgstPaise > 0 ? (
                  <>
                    <tr>
                      <td className="py-1 text-muted-foreground">CGST</td>
                      <td className="py-1 text-right">{formatINR(calc.cgstPaise)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-muted-foreground">SGST</td>
                      <td className="py-1 text-right">{formatINR(calc.sgstPaise)}</td>
                    </tr>
                  </>
                ) : null}
                {calc.igstPaise > 0 ? (
                  <tr>
                    <td className="py-1 text-muted-foreground">IGST</td>
                    <td className="py-1 text-right">{formatINR(calc.igstPaise)}</td>
                  </tr>
                ) : null}
                {calc.roundOffPaise !== 0 ? (
                  <tr>
                    <td className="py-1 text-muted-foreground">Round Off</td>
                    <td className="py-1 text-right">
                      {formatINR(calc.roundOffPaise)}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-t border-border font-semibold">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-right">{formatINR(calc.totalPaise)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enter valid line items to see totals.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {!isReadOnly ? (
          <>
            <Button type="button" onClick={handleSaveDraft} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Draft"}
            </Button>
            <Button type="button" variant="outline" onClick={handlePreviewPdf}>
              Preview PDF
            </Button>
            {isConfirmingFinalize ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Assigns a permanent invoice number; can&apos;t be edited after.
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleFinalize}
                  disabled={isFinalizing}
                >
                  {isFinalizing ? "Finalizing..." : "Confirm"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsConfirmingFinalize(false)}
                  disabled={isFinalizing}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsConfirmingFinalize(true)}
              >
                Finalize Invoice
              </Button>
            )}
          </>
        ) : (
          <Button type="button" variant="outline" onClick={handlePreviewPdf}>
            Download PDF
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleSignPdf}
          disabled={isSigning}
        >
          {isSigning ? "Signing..." : "Sign PDF (DSC)"}
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
    </div>
  );
}

function Field({
  label,
  htmlFor,
  caption,
  children,
}: {
  label: string;
  htmlFor: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {caption ? (
        <p className="text-xs text-muted-foreground">{caption}</p>
      ) : null}
    </div>
  );
}
