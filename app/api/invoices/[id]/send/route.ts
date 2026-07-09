import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { assertTransition, InvalidInvoiceTransitionError } from "@/lib/invoice-state-machine";
import { generateInvoiceNumber } from "@/lib/invoice-number";
import { renderInvoiceHtml } from "@/lib/pdf/render-invoice-html";
import { generatePdfBuffer } from "@/lib/pdf/generate-pdf";
import { sendMail } from "@/lib/email";
import { formatINR } from "@/lib/money";

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

  if (invoice.lineItems.length === 0) {
    return NextResponse.json(
      { error: "Cannot send an invoice with no line items" },
      { status: 400 },
    );
  }

  try {
    assertTransition(invoice.status, "SENT");
  } catch (error) {
    if (error instanceof InvalidInvoiceTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const businessProfile = await prisma.businessProfile.findFirst();
  if (!businessProfile) {
    return NextResponse.json(
      { error: "Set up your business profile under Settings first" },
      { status: 400 },
    );
  }

  const sentAt = new Date();

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const { number, financialYear } = await generateInvoiceNumber(
        tx,
        businessProfile.invoiceNumberFormat,
        invoice.issueDate,
      );

      const next = await tx.invoice.update({
        where: { id },
        data: { status: "SENT", number, financialYear, sentAt },
        include: { client: true, lineItems: { orderBy: { sortOrder: "asc" } } },
      });

      await tx.activityLog.create({
        data: {
          entityType: "Invoice",
          entityId: id,
          action: "SEND",
          beforeJson: { status: invoice.status },
          afterJson: { status: next.status, number: next.number },
          actorId: user.id,
        },
      });

      return next;
    });
  } catch (error) {
    // Invoice numbering must never fail silently — an uncaught exception
    // here would otherwise bubble up as a raw non-JSON 500, which the
    // client can't parse, so the UI shows nothing at all and the invoice
    // is left stuck on Draft with no visible explanation.
    console.error("Failed to allocate invoice number / mark as sent", error);
    return NextResponse.json(
      {
        error:
          "Failed to send invoice — could not allocate an invoice number. Please try again.",
      },
      { status: 500 },
    );
  }

  try {
    const html = await renderInvoiceHtml(updated, businessProfile);
    const pdfBuffer = await generatePdfBuffer(html);

    if (!updated.number) {
      throw new Error("Invoice number was not allocated");
    }

    if (updated.client.email) {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const shareUrl = `${appUrl}/i/${updated.publicShareToken}`;
      await sendMail({
        to: updated.client.email,
        subject: `Invoice ${updated.number} from ${businessProfile.tradeName ?? businessProfile.legalName}`,
        html: `<p>Hi ${updated.client.name},</p><p>Please find attached invoice ${updated.number} for ${formatINR(updated.totalPaise)}.</p><p>You can also view and download it here: <a href="${shareUrl}">${shareUrl}</a></p><p>Thank you for your business.</p>`,
        attachments: [
          {
            filename: `${updated.number.replace(/\//g, "-")}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    }
  } catch (error) {
    // The invoice is already numbered and SENT (immutable) at this point —
    // that must not be rolled back, since re-sending would burn another
    // sequence number. Surface the delivery failure without undoing the
    // status transition; the owner can still download/share the PDF
    // manually from the invoice detail page.
    console.error("Failed to generate/send invoice PDF", error);
    return NextResponse.json(
      {
        invoice: updated,
        warning:
          "Invoice was sent and numbered, but the PDF/email delivery failed. You can retry sharing the link manually.",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({ invoice: updated });
}
