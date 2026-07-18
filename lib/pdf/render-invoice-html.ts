import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  BusinessProfile,
  Prisma,
} from "@/lib/generated/prisma/client";
import { formatINR, formatIndianNumber } from "@/lib/money";
import { amountInWordsFromPaise } from "@/lib/amount-in-words";
import { recalculateInvoice } from "@/lib/invoice-calc";
import { GST_STATE_BY_CODE } from "@/lib/constants/gst-states";

export type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: { client: true; lineItems: true };
}>;

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

function mimeFromExtension(ext: string): string {
  return ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
}

/**
 * Inlines an image as a base64 data URI so PDF rendering never depends on
 * a live network fetch during the render itself (deterministic — same
 * guarantee as not using Date.now()/Math.random() in the template).
 * Handles both local disk paths (fully-local dev, anything under
 * `public/` — not just `/uploads/...`) and full https URLs (Supabase
 * Storage in production) — one function, two sources.
 */
async function localImageToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    if (url.startsWith("/") && !url.startsWith("//")) {
      const filePath = path.join(process.cwd(), "public", url);
      const buffer = await readFile(filePath);
      const ext = path.extname(url).slice(1).toLowerCase();
      return `data:${mimeFromExtension(ext)};base64,${buffer.toString("base64")}`;
    }

    if (url.startsWith("http")) {
      const response = await fetch(url);
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type");
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = path.extname(new URL(url).pathname).slice(1).toLowerCase();
      const mime = contentType ?? mimeFromExtension(ext);
      return `data:${mime};base64,${buffer.toString("base64")}`;
    }

    return url;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Darkens a hex color toward black by `amount` (0-1) -- used to derive the
 * heading/title color from the user's single brand color, without
 * requiring them to pick more than one.
 */
function darken(hexColor: string, amount: number): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const mixChannel = (c: number) => Math.round(c * (1 - amount));
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mixChannel(r))}${toHex(mixChannel(g))}${toHex(mixChannel(b))}`;
}

interface LineItemRow {
  description: string;
  hsnSacCode: string;
  quantity: string;
  unit: string;
  rate: string;
  discountPercent: string;
  taxableValue: string;
  taxRatePercent: string;
  lineTotal: string;
}

interface RateBreakdownRow {
  taxRatePercent: string;
  taxableValue: string;
  cgst: string;
  sgst: string;
  igst: string;
}

interface InvoiceViewModel {
  isSameStateSupply: boolean;
  isExport: boolean;
  number: string;
  issueDate: string;
  dueDate: string;
  placeOfSupply: string;
  business: {
    legalName: string;
    tradeName: string | null;
    gstin: string | null;
    pan: string | null;
    addressLines: string[];
    email: string;
    phone: string;
    website: string | null;
    logoDataUri: string | null;
    signatureDataUri: string | null;
    bankName: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    upiId: string | null;
    brandColor: string;
  };
  client: {
    name: string;
    company: string | null;
    gstin: string | null;
    addressLines: string[];
  };
  lineItems: LineItemRow[];
  rateBreakdown: RateBreakdownRow[];
  subtotal: string;
  discount: string;
  hasDiscount: boolean;
  cgst: string;
  sgst: string;
  igst: string;
  roundOff: string;
  hasRoundOff: boolean;
  total: string;
  amountInWords: string;
  notes: string | null;
  terms: string | null;
  exportDeclarationText: string | null;
}

function joinAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(", ");
}

/**
 * Groups an address into up to 3 display lines (line1 / line2+city /
 * state+pincode) for letterhead-style layouts, instead of one long
 * comma-joined paragraph -- gives the FROM and BILL TO boxes predictable,
 * similarly-sized content regardless of how many address fields are filled
 * in.
 */
function addressLines(parts: {
  line1: string | null | undefined;
  line2: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  pincode: string | null | undefined;
}): string[] {
  const lines: string[] = [];
  if (parts.line1) lines.push(parts.line1);
  const line2 = joinAddress([parts.line2, parts.city]);
  if (line2) lines.push(line2);
  const line3 = [parts.state, parts.pincode].filter(Boolean).join(" ");
  if (line3) lines.push(line3);
  return lines;
}

async function buildViewModel(
  invoice: InvoiceForPdf,
  businessProfile: BusinessProfile,
): Promise<InvoiceViewModel> {
  const calc = recalculateInvoice(businessProfile.stateCode, {
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    isExport: invoice.isExport,
    discountPaise: invoice.discountPaise,
    lineItems: invoice.lineItems,
  });

  const [logoDataUri, signatureDataUri] = await Promise.all([
    localImageToDataUri(businessProfile.logoUrl),
    localImageToDataUri(businessProfile.signatureUrl),
  ]);

  return {
    isSameStateSupply: businessProfile.stateCode === invoice.placeOfSupplyStateCode,
    isExport: invoice.isExport,
    number: invoice.number ?? "DRAFT",
    issueDate: formatDate(invoice.issueDate),
    dueDate: formatDate(invoice.dueDate),
    placeOfSupply: `${invoice.placeOfSupplyStateCode} — ${
      GST_STATE_BY_CODE.get(invoice.placeOfSupplyStateCode) ?? ""
    }`,
    business: {
      legalName: businessProfile.legalName,
      tradeName: businessProfile.tradeName,
      gstin: businessProfile.gstin,
      pan: businessProfile.pan,
      addressLines: addressLines({
        line1: businessProfile.addressLine1,
        line2: businessProfile.addressLine2,
        city: businessProfile.city,
        state: businessProfile.state,
        pincode: businessProfile.pincode,
      }),
      email: businessProfile.email,
      phone: businessProfile.phone,
      website: businessProfile.website,
      logoDataUri,
      signatureDataUri,
      bankName: businessProfile.bankName,
      accountNumber: businessProfile.accountNumber,
      ifsc: businessProfile.ifsc,
      upiId: businessProfile.upiId,
      brandColor: businessProfile.brandColor,
    },
    client: {
      name: invoice.client.name,
      company: invoice.client.company,
      gstin: invoice.client.gstin,
      addressLines: addressLines({
        line1: invoice.client.billingAddressLine1,
        line2: invoice.client.billingAddressLine2,
        city: invoice.client.city,
        state: invoice.client.state,
        pincode: invoice.client.pincode,
      }),
    },
    lineItems: invoice.lineItems.map((li) => ({
      description: li.description,
      hsnSacCode: li.hsnSacCode,
      quantity: li.quantity.toString(),
      unit: li.unit,
      rate: formatIndianNumber(li.ratePaise),
      discountPercent: li.discountPercent.toString(),
      taxableValue: formatIndianNumber(li.taxableValuePaise),
      taxRatePercent: li.taxRatePercent.toString(),
      lineTotal: formatIndianNumber(li.lineTotalPaise),
    })),
    rateBreakdown: calc.rateBreakdown.map((b) => ({
      taxRatePercent: b.taxRatePercent,
      taxableValue: formatIndianNumber(b.taxableValuePaise),
      cgst: formatIndianNumber(b.cgstPaise),
      sgst: formatIndianNumber(b.sgstPaise),
      igst: formatIndianNumber(b.igstPaise),
    })),
    subtotal: formatINR(invoice.subtotalPaise),
    discount: formatINR(invoice.discountPaise),
    hasDiscount: invoice.discountPaise > 0,
    cgst: formatINR(invoice.cgstPaise),
    sgst: formatINR(invoice.sgstPaise),
    igst: formatINR(invoice.igstPaise),
    roundOff: formatINR(invoice.roundOffPaise),
    hasRoundOff: invoice.roundOffPaise !== 0,
    total: formatINR(invoice.totalPaise),
    amountInWords: amountInWordsFromPaise(invoice.totalPaise),
    notes: invoice.notes,
    terms: invoice.terms,
    exportDeclarationText: invoice.isExport
      ? businessProfile.exportDeclarationText
      : null,
  };
}

const BASE_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
    margin: 0;
    padding: 32px 40px;
    font-size: 12px;
    line-height: 1.5;
  }
  table { width: 100%; border-collapse: collapse; }
  .muted { color: #6b6b6b; }
  .right { text-align: right; }
  .mt-24 { margin-top: 24px; }
  .mt-16 { margin-top: 16px; }
  .logo { max-height: 56px; max-width: 180px; object-fit: contain; }
  .signature { max-height: 48px; max-width: 160px; object-fit: contain; }
`;

function formatRatePercent(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Renders an address as stacked lines with a trailing comma on all but the last. */
function renderAddressLines(lines: string[]): string {
  return lines
    .map(
      (line, i) =>
        `<div>${escapeHtml(line)}${i < lines.length - 1 ? "," : ""}</div>`,
    )
    .join("");
}

function professionalStyles(brand: string, dark: string): string {
  return `
  body.professional-page { padding: 0; }
  .pv-topbar { height: 6px; background: ${brand}; }
  .pv-content { padding: 28px 40px 32px 40px; }
  .pv-logo-fallback { font-size: 22px; font-weight: 800; color: ${dark}; }
  .pv-title { font-size: 30px; font-weight: 800; color: ${dark}; letter-spacing: 0.01em; }
  .pv-kv-table { width: auto; border-collapse: collapse; }
  .pv-kv-table td { padding: 3px 0; font-size: 11px; }
  .pv-kv-table .pv-kv-label { text-align: right; padding-right: 6px; white-space: nowrap; color: #445; }
  .pv-kv-table .pv-kv-colon { padding: 0 2px; color: #445; }
  .pv-kv-table .pv-kv-value { text-align: left; padding-left: 6px; white-space: nowrap; color: #1a1a1a; }
  .pv-kv-table.pv-kv-align-right { margin-left: auto; }
  .pv-kv-table.pv-kv-align-center { margin: 0 auto; }
  .pv-kv-value-strong { font-weight: 600; }
  .pv-card-row { display: flex; align-items: stretch; gap: 4%; }
  .pv-card { flex: 1 1 0; border: 1px solid #d8dee8; border-radius: 10px; padding: 14px 16px; min-height: 84px; }
  .pv-card-title { font-size: 12px; font-weight: 700; color: ${brand}; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
  .pv-items th { background: ${brand}; color: #fff; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.03em; padding: 8px; text-align: left; }
  .pv-items td { padding: 7px 8px; font-size: 11px; border-bottom: 1px solid #eef1f5; }
  .pv-breakdown th, .pv-breakdown td { padding: 5px 8px; font-size: 10px; border: 1px solid #e1e6ee; }
  .pv-breakdown th { background: #eef2fb; color: #445; font-weight: 600; }
  .pv-totals td { padding: 4px 0; font-size: 12px; }
  .pv-totals .label { color: #556; }
  .pv-totals .pv-grand td { font-size: 15px; font-weight: 800; color: ${dark}; border-top: 1.5px solid #d8dee8; padding-top: 8px; }
  .pv-words-box { border: 1px solid #d8dee8; border-radius: 10px; padding: 12px 16px; }
  .pv-sign-line { border-top: 1px solid #333; margin-top: 42px; padding-top: 4px; width: 200px; margin-left: auto; text-align: center; font-size: 10px; color: #556; }
  `;
}

function renderProfessionalItemsTable(vm: InvoiceViewModel): string {
  return `
  <table class="pv-items mt-16">
    <thead>
      <tr>
        <th style="width: 28px;">#</th>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th class="right">Rate (₹)</th>
        <th class="right">Disc %</th>
        <th class="right">Taxable Value (₹)</th>
        <th class="right">Tax %</th>
        <th class="right">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${vm.lineItems
        .map(
          (li, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(li.description)}</td>
        <td>${escapeHtml(li.hsnSacCode)}</td>
        <td class="right">${li.quantity}</td>
        <td>${escapeHtml(li.unit)}</td>
        <td class="right">${li.rate}</td>
        <td class="right">${li.discountPercent}%</td>
        <td class="right">${li.taxableValue}</td>
        <td class="right">${li.taxRatePercent}%</td>
        <td class="right">${li.lineTotal}</td>
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderProfessionalBreakdown(vm: InvoiceViewModel): string {
  if (vm.isExport || vm.rateBreakdown.every((b) => b.taxRatePercent === "0")) {
    return "";
  }
  return `
  <div class="pv-card-title" style="margin-bottom: 6px;">Tax Breakup</div>
  <table class="pv-breakdown" style="width: 100%;">
    <thead>
      <tr>
        <th>Rate</th>
        <th class="right">Taxable Value (₹)</th>
        ${vm.isSameStateSupply ? `<th class="right">CGST (₹)</th><th class="right">SGST (₹)</th>` : `<th class="right">IGST (₹)</th>`}
      </tr>
    </thead>
    <tbody>
      ${vm.rateBreakdown
        .map(
          (b) => `
      <tr>
        <td>${b.taxRatePercent}%</td>
        <td class="right">${b.taxableValue}</td>
        ${vm.isSameStateSupply ? `<td class="right">${b.cgst}</td><td class="right">${b.sgst}</td>` : `<td class="right">${b.igst}</td>`}
      </tr>`,
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderProfessionalTotals(vm: InvoiceViewModel): string {
  // Only label with an inline rate when the whole invoice has a single tax
  // rate -- with multiple rate buckets there's no single "the rate" to show,
  // and the Tax Breakup table already spells those out per-rate.
  const singleRate =
    vm.rateBreakdown.length === 1
      ? parseFloat(vm.rateBreakdown[0].taxRatePercent)
      : null;
  const cgstSgstLabel =
    singleRate !== null
      ? `CGST (${formatRatePercent(singleRate / 2)}%)`
      : "CGST";
  const sgstLabel =
    singleRate !== null
      ? `SGST (${formatRatePercent(singleRate / 2)}%)`
      : "SGST";
  const igstLabel =
    singleRate !== null ? `IGST (${formatRatePercent(singleRate)}%)` : "IGST";

  return `
  <table class="pv-totals" style="width: 100%; max-width: 260px; margin-left: auto;">
    <tr><td class="label">Subtotal</td><td class="right">${vm.subtotal}</td></tr>
    ${vm.hasDiscount ? `<tr><td class="label">Discount</td><td class="right">-${vm.discount}</td></tr>` : ""}
    ${vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">${cgstSgstLabel}</td><td class="right">${vm.cgst}</td></tr><tr><td class="label">${sgstLabel}</td><td class="right">${vm.sgst}</td></tr>` : ""}
    ${!vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">${igstLabel}</td><td class="right">${vm.igst}</td></tr>` : ""}
    ${vm.hasRoundOff ? `<tr><td class="label">Round Off</td><td class="right">${vm.roundOff}</td></tr>` : ""}
    <tr class="pv-grand"><td>Grand Total</td><td class="right">${vm.total}</td></tr>
  </table>`;
}

function renderProfessionalWordsBox(vm: InvoiceViewModel): string {
  return `
  <div class="pv-words-box mt-16">
    <span class="pv-card-title" style="margin-bottom: 0; margin-right: 12px;">Amount in Words</span>
    <span class="muted">${escapeHtml(vm.amountInWords)}</span>
  </div>`;
}

function renderProfessionalDetails(vm: InvoiceViewModel): string {
  const hasBank =
    vm.business.bankName ||
    vm.business.accountNumber ||
    vm.business.ifsc ||
    vm.business.upiId;
  return `
  <table class="mt-16" style="width: 100%;">
    <tr>
      <td style="width: 48%; vertical-align: top;">
        ${
          hasBank
            ? `
        <div class="pv-card-title" style="text-align: center; margin-right: 10px;">Bank Details</div>
        <table class="pv-kv-table pv-kv-align-center">
          ${vm.business.bankName ? `<tr><td class="pv-kv-label">Bank Name</td><td class="pv-kv-colon">:</td><td class="pv-kv-value">${escapeHtml(vm.business.bankName)}</td></tr>` : ""}
          ${vm.business.accountNumber ? `<tr><td class="pv-kv-label">A/C Number</td><td class="pv-kv-colon">:</td><td class="pv-kv-value">${escapeHtml(vm.business.accountNumber)}</td></tr>` : ""}
          ${vm.business.ifsc ? `<tr><td class="pv-kv-label">IFSC Code</td><td class="pv-kv-colon">:</td><td class="pv-kv-value">${escapeHtml(vm.business.ifsc)}</td></tr>` : ""}
          ${vm.business.upiId ? `<tr><td class="pv-kv-label">UPI ID</td><td class="pv-kv-colon">:</td><td class="pv-kv-value">${escapeHtml(vm.business.upiId)}</td></tr>` : ""}
        </table>`
            : ""
        }
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; vertical-align: top;">
        ${
          vm.terms
            ? `
        <div class="pv-card-title">Terms &amp; Conditions</div>
        <div class="muted" style="font-size: 11px;">${escapeHtml(vm.terms)}</div>`
            : ""
        }
        ${
          vm.notes
            ? `
        <div class="pv-card-title mt-16">Notes</div>
        <div class="muted" style="font-size: 11px;">${escapeHtml(vm.notes)}</div>`
            : ""
        }
        ${vm.exportDeclarationText ? `<div class="mt-16 muted" style="font-style: italic; font-size: 10.5px;">${escapeHtml(vm.exportDeclarationText)}</div>` : ""}
      </td>
    </tr>
  </table>`;
}

function renderProfessionalFooter(vm: InvoiceViewModel, brand: string): string {
  return `
  <table class="mt-24" style="width: 100%; border-top: 1px solid #e1e6ee; padding-top: 16px;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        ${vm.business.website ? `<span class="muted" style="font-size: 10.5px;">${escapeHtml(vm.business.website)}</span>` : ""}
      </td>
      <td style="width: 50%; vertical-align: top; text-align: right;">
        <div style="font-weight: 700; color: ${brand}; font-size: 11px;">For ${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
        ${vm.business.signatureDataUri ? `<img class="signature" src="${vm.business.signatureDataUri}" alt="Signature" style="margin-top: 8px;" />` : `<div style="height: 48px;"></div>`}
        <div class="pv-sign-line">Authorised Signatory</div>
      </td>
    </tr>
  </table>`;
}

function renderProfessionalTemplate(vm: InvoiceViewModel): string {
  const brand = vm.business.brandColor;
  const dark = darken(brand, 0.55);
  const logoHtml = vm.business.logoDataUri
    ? `<img class="logo" src="${vm.business.logoDataUri}" alt="Logo" style="margin-bottom: 4px;" />`
    : `<div class="pv-logo-fallback">${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${BASE_STYLES}
  ${professionalStyles(brand, dark)}
</style>
</head>
<body class="professional-page">
  <div class="pv-topbar"></div>
  <div class="pv-content">
    <table style="width: 100%;">
      <tr>
        <td style="width: 55%; vertical-align: top;">
          ${logoHtml}
          ${vm.business.gstin ? `<div class="muted mt-16" style="font-size: 11px;">GSTIN: ${escapeHtml(vm.business.gstin)}</div>` : ""}
        </td>
        <td style="width: 45%; vertical-align: top;" class="right">
          <div class="pv-title">TAX INVOICE</div>
          <table class="pv-kv-table pv-kv-align-right mt-16">
            <tr><td class="pv-kv-label">Invoice No.</td><td class="pv-kv-colon">:</td><td class="pv-kv-value pv-kv-value-strong">${escapeHtml(vm.number)}</td></tr>
            <tr><td class="pv-kv-label">Issue Date</td><td class="pv-kv-colon">:</td><td class="pv-kv-value pv-kv-value-strong">${vm.issueDate}</td></tr>
            <tr><td class="pv-kv-label">Due Date</td><td class="pv-kv-colon">:</td><td class="pv-kv-value pv-kv-value-strong">${vm.dueDate}</td></tr>
            <tr><td class="pv-kv-label">Place of Supply</td><td class="pv-kv-colon">:</td><td class="pv-kv-value pv-kv-value-strong">${escapeHtml(vm.placeOfSupply)}</td></tr>
          </table>
        </td>
      </tr>
    </table>

    <div class="pv-card-row mt-24">
      <div class="pv-card">
        <div class="pv-card-title">From</div>
        <div style="font-weight: 700; font-size: 12px;">${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
        <div class="muted" style="font-size: 11px;">${renderAddressLines(vm.business.addressLines)}</div>
      </div>
      <div class="pv-card">
        <div class="pv-card-title">Bill To</div>
        <div style="font-weight: 700; font-size: 12px;">${escapeHtml(vm.client.name)}</div>
        ${vm.client.company ? `<div style="font-size: 11px;">${escapeHtml(vm.client.company)}</div>` : ""}
        ${vm.client.gstin ? `<div class="muted" style="font-size: 11px;">GSTIN: ${escapeHtml(vm.client.gstin)}</div>` : ""}
        <div class="muted" style="font-size: 11px;">${renderAddressLines(vm.client.addressLines)}</div>
      </div>
    </div>

    ${renderProfessionalItemsTable(vm)}

    <table class="mt-16" style="width: 100%;">
      <tr>
        <td style="width: 55%; vertical-align: top;">
          ${renderProfessionalBreakdown(vm)}
        </td>
        <td style="width: 45%; vertical-align: top;">
          ${renderProfessionalTotals(vm)}
        </td>
      </tr>
    </table>

    ${renderProfessionalWordsBox(vm)}
    ${renderProfessionalDetails(vm)}
    ${renderProfessionalFooter(vm, brand)}
  </div>
</body>
</html>`;
}

export async function renderInvoiceHtml(
  invoice: InvoiceForPdf,
  businessProfile: BusinessProfile,
): Promise<string> {
  const vm = await buildViewModel(invoice, businessProfile);
  return renderProfessionalTemplate(vm);
}
