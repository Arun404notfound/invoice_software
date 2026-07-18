import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const [signature, invoice] = await Promise.all([
    prisma.invoiceSignature.findUnique({ where: { invoiceId: id } }),
    prisma.invoice.findUnique({ where: { id }, select: { number: true } }),
  ]);

  if (!signature || signature.status !== "SIGNED" || !signature.signedPdf) {
    return NextResponse.json(
      { error: "This invoice has not been digitally signed yet" },
      { status: 404 },
    );
  }

  const filename = `${(invoice?.number ?? "draft").replace(/\//g, "-")}-signed.pdf`;

  return new NextResponse(new Uint8Array(signature.signedPdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
