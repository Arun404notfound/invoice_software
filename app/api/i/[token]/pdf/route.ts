import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderInvoiceHtml } from "@/lib/pdf/render-invoice-html";
import { generatePdfBuffer } from "@/lib/pdf/generate-pdf";

export const maxDuration = 30;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { publicShareToken: token },
    include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice || invoice.status === "DRAFT") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const businessProfile = await prisma.businessProfile.findFirst();
  if (!businessProfile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const html = await renderInvoiceHtml(invoice, businessProfile);
  const pdfBuffer = await generatePdfBuffer(html);
  const filename = `${(invoice.number ?? "invoice").replace(/\//g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
