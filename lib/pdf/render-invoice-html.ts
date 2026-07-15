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
 * Handles both local disk paths (fully-local dev, `/uploads/...`) and full
 * https URLs (Supabase Storage in production) — one function, two sources.
 */
async function localImageToDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;

  try {
    if (url.startsWith("/uploads/")) {
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

let letterheadDataUriPromise: Promise<string | null> | null = null;

/**
 * The Modern template's background is a fixed letterhead asset (logo +
 * corner ribbon + footer bar baked into one PNG) rather than something
 * derived per-business, so it's read once from disk and cached for the life
 * of the process instead of going through localImageToDataUri per request.
 */
function getLetterheadDataUri(): Promise<string | null> {
  if (!letterheadDataUriPromise) {
    letterheadDataUriPromise = readFile(
      path.join(process.cwd(), "public", "blank_template.png"),
    )
      .then((buffer) => `data:image/png;base64,${buffer.toString("base64")}`)
      .catch(() => null);
  }
  return letterheadDataUriPromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Picks readable text colors for a colored header band, since the brand
 * color is user-chosen and can't be assumed dark (a light or white brand
 * color would otherwise render invisible white-on-white text, which is
 * exactly what happened before this existed).
 */
function contrastTextColors(hexColor: string): {
  text: string;
  mutedText: string;
  isLight: boolean;
} {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  // Relative luminance (WCAG-ish approximation).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = luminance > 0.6;
  return {
    text: isLight ? "#1a1a1a" : "#ffffff",
    mutedText: isLight ? "rgba(26,26,26,0.7)" : "rgba(255,255,255,0.75)",
    isLight,
  };
}

/**
 * Mixes a hex color toward white or black by `amount` (0-1), used to derive
 * tints/shades of the user's brand color for the Modern template's accent
 * bands, table stripes, and highlighted total row — all without requiring
 * the user to pick more than one color.
 */
function mix(hexColor: string, target: "white" | "black", amount: number): string {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const t = target === "white" ? 255 : 0;
  const mixChannel = (c: number) => Math.round(c + (t - c) * amount);
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mixChannel(r))}${toHex(mixChannel(g))}${toHex(mixChannel(b))}`;
}

function lighten(hexColor: string, amount: number): string {
  return mix(hexColor, "white", amount);
}

function darken(hexColor: string, amount: number): string {
  return mix(hexColor, "black", amount);
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
    address: string;
    email: string;
    phone: string;
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
    address: string;
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
      address: joinAddress([
        businessProfile.addressLine1,
        businessProfile.addressLine2,
        businessProfile.city,
        `${businessProfile.state} ${businessProfile.pincode}`,
      ]),
      email: businessProfile.email,
      phone: businessProfile.phone,
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
      address: joinAddress([
        invoice.client.billingAddressLine1,
        invoice.client.billingAddressLine2,
        invoice.client.city,
        invoice.client.state,
        invoice.client.pincode,
      ]),
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

const SHARED_STYLES = `
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
  .center { text-align: center; }
  .mt-24 { margin-top: 24px; }
  .mt-16 { margin-top: 16px; }
  .section-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8a8a8a;
    margin-bottom: 4px;
  }
  .items-table th, .items-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #e5e5e5;
    font-size: 11px;
  }
  .items-table th { text-align: left; color: #6b6b6b; font-weight: 600; }
  .totals-table td { padding: 3px 0; font-size: 12px; }
  .totals-table .label { color: #6b6b6b; }
  .totals-table .total-row td { font-size: 14px; font-weight: 700; border-top: 1px solid #1a1a1a; padding-top: 8px; }
  .breakdown-table th, .breakdown-table td { padding: 4px 8px; font-size: 10px; border: 1px solid #e5e5e5; }
  .logo { max-height: 56px; max-width: 180px; object-fit: contain; }
  .signature { max-height: 48px; max-width: 160px; object-fit: contain; }
`;

function renderLineItemsTable(vm: InvoiceViewModel): string {
  return `
  <table class="items-table mt-24">
    <thead>
      <tr>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th class="right">Rate</th>
        <th class="right">Disc %</th>
        <th class="right">Taxable Value</th>
        <th class="right">Tax %</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${vm.lineItems
        .map(
          (li) => `
      <tr>
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

function renderRateBreakdownTable(vm: InvoiceViewModel): string {
  if (vm.isExport || vm.rateBreakdown.every((b) => b.taxRatePercent === "0")) {
    return "";
  }
  return `
  <div class="mt-16">
    <div class="section-title">Tax Breakup</div>
    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Rate</th>
          <th class="right">Taxable Value</th>
          ${vm.isSameStateSupply ? "<th class=\"right\">CGST</th><th class=\"right\">SGST</th>" : "<th class=\"right\">IGST</th>"}
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
    </table>
  </div>`;
}

function renderTotalsBlock(vm: InvoiceViewModel): string {
  return `
  <table class="totals-table mt-16" style="width: 260px; margin-left: auto;">
    <tr><td class="label">Subtotal</td><td class="right">${vm.subtotal}</td></tr>
    ${vm.hasDiscount ? `<tr><td class="label">Discount</td><td class="right">-${vm.discount}</td></tr>` : ""}
    ${vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">CGST</td><td class="right">${vm.cgst}</td></tr><tr><td class="label">SGST</td><td class="right">${vm.sgst}</td></tr>` : ""}
    ${!vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">IGST</td><td class="right">${vm.igst}</td></tr>` : ""}
    ${vm.hasRoundOff ? `<tr><td class="label">Round Off</td><td class="right">${vm.roundOff}</td></tr>` : ""}
    <tr class="total-row"><td>Total</td><td class="right">${vm.total}</td></tr>
  </table>
  <p class="right muted mt-16" style="font-size: 11px;">${escapeHtml(vm.amountInWords)}</p>`;
}

function renderFooter(vm: InvoiceViewModel): string {
  return `
  <table class="mt-24" style="width: 100%;">
    <tr>
      <td style="width: 60%; vertical-align: top;">
        <div class="section-title">Bank Details</div>
        ${vm.business.bankName ? `<div>${escapeHtml(vm.business.bankName)}</div>` : ""}
        ${vm.business.accountNumber ? `<div>A/C: ${escapeHtml(vm.business.accountNumber)}</div>` : ""}
        ${vm.business.ifsc ? `<div>IFSC: ${escapeHtml(vm.business.ifsc)}</div>` : ""}
        ${vm.business.upiId ? `<div>UPI: ${escapeHtml(vm.business.upiId)}</div>` : ""}
        ${vm.terms ? `<div class="section-title mt-16">Terms</div><div class="muted">${escapeHtml(vm.terms)}</div>` : ""}
        ${vm.notes ? `<div class="section-title mt-16">Notes</div><div class="muted">${escapeHtml(vm.notes)}</div>` : ""}
        ${vm.exportDeclarationText ? `<div class="mt-16 muted" style="font-style: italic;">${escapeHtml(vm.exportDeclarationText)}</div>` : ""}
      </td>
      <td style="width: 40%; vertical-align: bottom; text-align: right;">
        ${vm.business.signatureDataUri ? `<img class="signature" src="${vm.business.signatureDataUri}" alt="Signature" />` : ""}
        <div class="muted mt-16">For ${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
      </td>
    </tr>
  </table>`;
}

function renderCharcoalTemplate(vm: InvoiceViewModel): string {
  const contrast = contrastTextColors(vm.business.brandColor);
  const logoHtml = vm.business.logoDataUri
    ? contrast.isLight
      ? `<img class="logo" src="${vm.business.logoDataUri}" alt="Logo" style="margin-bottom: 8px;" />`
      : `<div style="display: inline-block; background: #ffffff; border-radius: 6px; padding: 6px 10px; margin-bottom: 8px;"><img class="logo" src="${vm.business.logoDataUri}" alt="Logo" /></div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${SHARED_STYLES}
  .header-band {
    background: ${vm.business.brandColor};
    color: ${contrast.text};
    margin: -32px -40px 24px -40px;
    padding: 32px 40px 24px 40px;
    ${contrast.isLight ? "border-bottom: 1px solid #e5e5e5;" : ""}
  }
  .header-band .muted { color: ${contrast.mutedText}; }
  .invoice-title { font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
</style>
</head>
<body>
  <div class="header-band">
    <table>
      <tr>
        <td style="vertical-align: top;">
          ${logoHtml}
          <div style="font-size: 16px; font-weight: 700;">${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
          ${vm.business.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.business.gstin)}</div>` : ""}
        </td>
        <td class="right" style="vertical-align: top;">
          <div class="invoice-title">TAX INVOICE</div>
          <div class="muted mt-16">${escapeHtml(vm.number)}</div>
        </td>
      </tr>
    </table>
  </div>

  <table>
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <div class="section-title">Bill To</div>
        <div style="font-weight: 600;">${escapeHtml(vm.client.name)}</div>
        ${vm.client.company ? `<div>${escapeHtml(vm.client.company)}</div>` : ""}
        ${vm.client.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.client.gstin)}</div>` : ""}
        <div class="muted">${escapeHtml(vm.client.address)}</div>
      </td>
      <td style="width: 50%; vertical-align: top;" class="right">
        <div class="muted">Issue Date: ${vm.issueDate}</div>
        <div class="muted">Due Date: ${vm.dueDate}</div>
        <div class="muted">Place of Supply: ${escapeHtml(vm.placeOfSupply)}</div>
        <div class="muted">Seller Address: ${escapeHtml(vm.business.address)}</div>
      </td>
    </tr>
  </table>

  ${renderLineItemsTable(vm)}
  ${renderRateBreakdownTable(vm)}
  ${renderTotalsBlock(vm)}
  ${renderFooter(vm)}
</body>
</html>`;
}

function renderClassicTemplate(vm: InvoiceViewModel): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${SHARED_STYLES}
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; }
  .invoice-title { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
</style>
</head>
<body>
  <table class="header">
    <tr>
      <td style="vertical-align: top;">
        ${vm.business.logoDataUri ? `<img class="logo" src="${vm.business.logoDataUri}" alt="Logo" style="margin-bottom: 8px;" />` : ""}
        <div style="font-size: 16px; font-weight: 700;">${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
        <div class="muted">${escapeHtml(vm.business.address)}</div>
        ${vm.business.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.business.gstin)}</div>` : ""}
      </td>
      <td class="right" style="vertical-align: top;">
        <div class="invoice-title">TAX INVOICE</div>
        <div class="muted mt-16">${escapeHtml(vm.number)}</div>
      </td>
    </tr>
  </table>

  <table class="mt-16">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <div class="section-title">Bill To</div>
        <div style="font-weight: 600;">${escapeHtml(vm.client.name)}</div>
        ${vm.client.company ? `<div>${escapeHtml(vm.client.company)}</div>` : ""}
        ${vm.client.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.client.gstin)}</div>` : ""}
        <div class="muted">${escapeHtml(vm.client.address)}</div>
      </td>
      <td style="width: 50%; vertical-align: top;" class="right">
        <div class="muted">Issue Date: ${vm.issueDate}</div>
        <div class="muted">Due Date: ${vm.dueDate}</div>
        <div class="muted">Place of Supply: ${escapeHtml(vm.placeOfSupply)}</div>
      </td>
    </tr>
  </table>

  ${renderLineItemsTable(vm)}
  ${renderRateBreakdownTable(vm)}
  ${renderTotalsBlock(vm)}
  ${renderFooter(vm)}
</body>
</html>`;
}

function modernStyles(
  brand: string,
  dark: string,
  tint: string,
  totalTint: string,
): string {
  return `
  body.modern-page { background: transparent; padding: 0; }
  .m-page-frame { position: relative; min-height: 1122px; }
  .m-letterhead-bg {
    position: absolute; top: 0; left: 0; width: 100%; height: 1122px;
    z-index: 0; object-fit: fill;
  }
  .m-page-content { position: relative; z-index: 1; padding: 32px 40px; }
  .m-content-start { margin-top: 130px; }
  .m-invoice-title { font-size: 30px; font-weight: 800; letter-spacing: 0.03em; }
  .m-invoice-sub {
    font-size: 10px; color: #8a8a8a; text-transform: uppercase;
    letter-spacing: 0.08em; margin-top: 2px;
  }
  .m-tabbox {
    border: 1px solid #d8dee8; border-radius: 10px;
    padding: 16px 16px 12px 16px; position: relative;
    margin-top: 14px; min-height: 70px;
  }
  .m-tab {
    position: absolute; top: -14px; left: 14px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.05em; padding: 5px 12px; border-radius: 5px;
    text-transform: uppercase; background: ${brand};
  }
  .m-tabbox-body { margin-top: 4px; }
  .m-metabox { border: 1px solid #d8dee8; border-radius: 10px; padding: 10px 14px; margin-top: 14px; }
  .m-meta-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 0;
    border-bottom: 1px dashed #e5e5e5; font-size: 11px;
  }
  .m-meta-row:last-child { border-bottom: none; }
  .m-meta-label { color: #6b6b6b; }
  .m-meta-value { flex: 1; text-align: right; font-weight: 600; }
  .m-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; background: ${brand}; }
  .m-items th, .m-items td { padding: 7px 8px; font-size: 11px; }
  .m-items th {
    color: #ffffff; text-align: left; font-weight: 600;
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em;
    background: ${dark};
  }
  .m-items td { border-bottom: 1px solid #eef1f5; }
  .m-items tr { break-inside: avoid; page-break-inside: avoid; }
  .m-items tr.odd td { background: ${tint}; }
  .m-breakdown th, .m-breakdown td { padding: 5px 8px; font-size: 10px; border: 1px solid #e5e5e5; }
  .m-breakdown th { background: ${tint}; }
  .m-totals td { padding: 4px 0; font-size: 12px; }
  .m-totals .label { color: #6b6b6b; }
  .m-totals .m-total-row td { font-size: 14px; font-weight: 800; padding: 8px 10px; background: ${totalTint}; }
  .m-sigbox {
    position: relative; border: 1px solid #d8dee8; border-radius: 10px;
    padding: 14px 16px; min-height: 90px; overflow: hidden; text-align: right;
  }
  `;
}

function renderModernItemsTable(vm: InvoiceViewModel): string {
  return `
  <table class="m-items mt-24">
    <thead>
      <tr>
        <th>Description</th>
        <th>HSN/SAC</th>
        <th class="right">Qty</th>
        <th>Unit</th>
        <th class="right">Rate</th>
        <th class="right">Disc %</th>
        <th class="right">Taxable Value</th>
        <th class="right">Tax %</th>
        <th class="right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${vm.lineItems
        .map(
          (li, i) => `
      <tr class="${i % 2 === 1 ? "odd" : ""}">
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

function renderModernBreakdown(vm: InvoiceViewModel): string {
  if (vm.isExport || vm.rateBreakdown.every((b) => b.taxRatePercent === "0")) {
    return "";
  }
  return `
  <div class="mt-16">
    <div class="section-title">Tax Breakup</div>
    <table class="m-breakdown">
      <thead>
        <tr>
          <th>Rate</th>
          <th class="right">Taxable Value</th>
          ${vm.isSameStateSupply ? "<th class=\"right\">CGST</th><th class=\"right\">SGST</th>" : "<th class=\"right\">IGST</th>"}
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
    </table>
  </div>`;
}

function renderModernTotals(vm: InvoiceViewModel): string {
  return `
  <table class="m-totals mt-16" style="width: 280px; margin-left: auto;">
    <tr><td class="label">Subtotal</td><td class="right">${vm.subtotal}</td></tr>
    ${vm.hasDiscount ? `<tr><td class="label">Discount</td><td class="right">-${vm.discount}</td></tr>` : ""}
    ${vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">CGST</td><td class="right">${vm.cgst}</td></tr><tr><td class="label">SGST</td><td class="right">${vm.sgst}</td></tr>` : ""}
    ${!vm.isSameStateSupply && !vm.isExport ? `<tr><td class="label">IGST</td><td class="right">${vm.igst}</td></tr>` : ""}
    ${vm.hasRoundOff ? `<tr><td class="label">Round Off</td><td class="right">${vm.roundOff}</td></tr>` : ""}
    <tr class="m-total-row"><td>TOTAL</td><td class="right">${vm.total}</td></tr>
  </table>
  <p class="right muted mt-16" style="font-size: 11px;">${escapeHtml(vm.amountInWords)}</p>`;
}

function renderModernFooter(vm: InvoiceViewModel, brand: string, contrast: ReturnType<typeof contrastTextColors>): string {
  return `
  <table class="mt-24" style="width: 100%;">
    <tr>
      <td style="width: 48%; vertical-align: top;">
        <div class="m-tabbox">
          <div class="m-tab" style="color: ${contrast.text};">Payment To</div>
          <div class="m-tabbox-body">
            ${vm.business.bankName ? `<div>${escapeHtml(vm.business.bankName)}</div>` : ""}
            ${vm.business.accountNumber ? `<div>A/C: ${escapeHtml(vm.business.accountNumber)}</div>` : ""}
            ${vm.business.ifsc ? `<div>IFSC: ${escapeHtml(vm.business.ifsc)}</div>` : ""}
            ${vm.business.upiId ? `<div>UPI: ${escapeHtml(vm.business.upiId)}</div>` : ""}
          </div>
        </div>
        ${vm.terms ? `<div class="section-title mt-16">Terms</div><div class="muted">${escapeHtml(vm.terms)}</div>` : ""}
        ${vm.notes ? `<div class="section-title mt-16">Notes</div><div class="muted">${escapeHtml(vm.notes)}</div>` : ""}
        ${vm.exportDeclarationText ? `<div class="mt-16 muted" style="font-style: italic;">${escapeHtml(vm.exportDeclarationText)}</div>` : ""}
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; vertical-align: bottom;">
        <div class="m-sigbox">
          <svg width="100%" height="70" viewBox="0 0 200 70" preserveAspectRatio="none" style="position: absolute; top: 0; left: 0; opacity: 0.12;">
            <path d="M10,50 Q100,-10 190,25" stroke="${brand}" stroke-width="3" fill="none" />
            <circle cx="185" cy="27" r="4" fill="${brand}" />
          </svg>
          <div style="position: relative;">
            ${vm.business.signatureDataUri ? `<img class="signature" src="${vm.business.signatureDataUri}" alt="Signature" />` : `<div style="height: 48px;"></div>`}
            <div class="muted mt-16">For ${escapeHtml(vm.business.tradeName ?? vm.business.legalName)}</div>
          </div>
        </div>
      </td>
    </tr>
  </table>`;
}

async function renderModernTemplate(vm: InvoiceViewModel): Promise<string> {
  const brand = vm.business.brandColor;
  const dark = darken(brand, 0.55);
  const tint = lighten(brand, 0.92);
  const totalTint = lighten(brand, 0.85);
  const contrast = contrastTextColors(brand);
  const letterheadDataUri = await getLetterheadDataUri();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  ${SHARED_STYLES}
  ${modernStyles(brand, dark, tint, totalTint)}
</style>
</head>
<body class="modern-page">
  <div class="m-page-frame">
  ${letterheadDataUri ? `<img class="m-letterhead-bg" src="${letterheadDataUri}" alt="" />` : ""}
  <div class="m-page-content">
  <table class="m-content-start" style="width: 100%;">
    <tr>
      <td style="vertical-align: top;">
        ${vm.business.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.business.gstin)}</div>` : ""}
      </td>
      <td class="right" style="vertical-align: top;">
        <div class="m-invoice-title" style="color: ${dark};">INVOICE</div>
        <div class="m-invoice-sub">GST Tax Invoice &middot; ${escapeHtml(vm.number)}</div>
      </td>
    </tr>
  </table>

  <table class="mt-24" style="width: 100%;">
    <tr>
      <td style="width: 48%; vertical-align: top;">
        <div class="m-tabbox">
          <div class="m-tab" style="color: ${contrast.text};">Bill To</div>
          <div class="m-tabbox-body">
            <div style="font-weight: 600;">${escapeHtml(vm.client.name)}</div>
            ${vm.client.company ? `<div>${escapeHtml(vm.client.company)}</div>` : ""}
            ${vm.client.gstin ? `<div class="muted">GSTIN: ${escapeHtml(vm.client.gstin)}</div>` : ""}
            <div class="muted">${escapeHtml(vm.client.address)}</div>
          </div>
        </div>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; vertical-align: top;">
        <div class="m-metabox">
          <div class="m-meta-row"><span class="m-dot"></span><span class="m-meta-label">Issue Date</span><span class="m-meta-value">${vm.issueDate}</span></div>
          <div class="m-meta-row"><span class="m-dot"></span><span class="m-meta-label">Due Date</span><span class="m-meta-value">${vm.dueDate}</span></div>
          <div class="m-meta-row"><span class="m-dot"></span><span class="m-meta-label">Place of Supply</span><span class="m-meta-value">${escapeHtml(vm.placeOfSupply)}</span></div>
        </div>
      </td>
    </tr>
  </table>

  <div class="muted mt-16" style="font-size: 11px;">Seller Address: ${escapeHtml(vm.business.address)}</div>

  ${renderModernItemsTable(vm)}
  ${renderModernBreakdown(vm)}
  ${renderModernTotals(vm)}
  ${renderModernFooter(vm, brand, contrast)}
  </div>
  </div>
</body>
</html>`;
}

export async function renderInvoiceHtml(
  invoice: InvoiceForPdf,
  businessProfile: BusinessProfile,
): Promise<string> {
  const vm = await buildViewModel(invoice, businessProfile);
  if (invoice.templateId === "CLASSIC") return renderClassicTemplate(vm);
  if (invoice.templateId === "MODERN") return await renderModernTemplate(vm);
  return renderCharcoalTemplate(vm);
}
