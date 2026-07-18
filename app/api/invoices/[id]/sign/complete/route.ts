import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { embedSignature } from "@/lib/pdf/signature/embed-signature";

const completeSchema = z.object({
  sessionId: z.string().min(1),
  signatureBase64: z.string().min(1),
  signerName: z.string().optional(),
  signerCertSubject: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { sessionId, signatureBase64, signerName, signerCertSubject } =
    parsed.data;

  const signature = await prisma.invoiceSignature.findUnique({
    where: { id: sessionId },
  });
  if (
    !signature ||
    signature.invoiceId !== id ||
    signature.status !== "PENDING" ||
    !signature.gapPdf ||
    signature.contentsInsertOffset === null ||
    signature.placeholderHexLength === null
  ) {
    return NextResponse.json(
      { error: "No pending signing session for this invoice. Start signing again." },
      { status: 409 },
    );
  }

  let signedPdf: Buffer;
  try {
    const rawSignature = Buffer.from(signatureBase64, "base64");
    signedPdf = embedSignature(
      Buffer.from(signature.gapPdf),
      signature.contentsInsertOffset,
      signature.placeholderHexLength,
      rawSignature,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to embed signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });

  await prisma.invoiceSignature.update({
    where: { id: sessionId },
    data: {
      status: "SIGNED",
      signedPdf: new Uint8Array(signedPdf),
      signerName,
      signerCertSubject,
      gapPdf: null,
    },
  });

  const filename = `${(invoice?.number ?? "draft").replace(/\//g, "-")}-signed.pdf`;

  return new NextResponse(new Uint8Array(signedPdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
