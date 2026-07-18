import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { renderInvoiceHtml } from "@/lib/pdf/render-invoice-html";
import { generatePdfBuffer } from "@/lib/pdf/generate-pdf";
import { preparePlaceholder } from "@/lib/pdf/signature/prepare-placeholder";

// Chromium cold-start + render can exceed Vercel's default function
// timeout; no effect outside Vercel.
export const maxDuration = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const businessProfile = await prisma.businessProfile.findFirst();
  if (!businessProfile) {
    return NextResponse.json(
      { error: "Set up your business profile under Settings first" },
      { status: 400 },
    );
  }

  const html = await renderInvoiceHtml(invoice, businessProfile);
  const pdfBuffer = await generatePdfBuffer(html);

  const placeholder = await preparePlaceholder(pdfBuffer, {
    reason: `Invoice ${invoice.number ?? invoice.id} approval`,
    contactInfo: businessProfile.email,
    name: businessProfile.tradeName ?? businessProfile.legalName,
    location: `${businessProfile.city}, ${businessProfile.state}`,
  });

  const gapPdfBytes = new Uint8Array(placeholder.gapPdf);
  const signature = await prisma.invoiceSignature.upsert({
    where: { invoiceId: id },
    create: {
      invoiceId: id,
      status: "PENDING",
      gapPdf: gapPdfBytes,
      contentsInsertOffset: placeholder.contentsInsertOffset,
      placeholderHexLength: placeholder.placeholderHexLength,
      digestBase64: placeholder.digest.toString("base64"),
      signingTime: placeholder.signingTime,
    },
    update: {
      status: "PENDING",
      gapPdf: gapPdfBytes,
      contentsInsertOffset: placeholder.contentsInsertOffset,
      placeholderHexLength: placeholder.placeholderHexLength,
      digestBase64: placeholder.digest.toString("base64"),
      signingTime: placeholder.signingTime,
      signedPdf: null,
      signerName: null,
      signerCertSubject: null,
    },
  });

  return NextResponse.json({
    sessionId: signature.id,
    digestBase64: placeholder.digest.toString("base64"),
    signingTime: placeholder.signingTime.toISOString(),
  });
}
