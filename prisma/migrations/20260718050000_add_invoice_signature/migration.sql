-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED');

-- CreateTable
CREATE TABLE "InvoiceSignature" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "gapPdf" BYTEA,
    "contentsInsertOffset" INTEGER,
    "placeholderHexLength" INTEGER,
    "digestBase64" TEXT,
    "signingTime" TIMESTAMP(3),
    "signedPdf" BYTEA,
    "signerName" TEXT,
    "signerCertSubject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceSignature_invoiceId_key" ON "InvoiceSignature"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceSignature_status_idx" ON "InvoiceSignature"("status");

-- AddForeignKey
ALTER TABLE "InvoiceSignature" ADD CONSTRAINT "InvoiceSignature_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
