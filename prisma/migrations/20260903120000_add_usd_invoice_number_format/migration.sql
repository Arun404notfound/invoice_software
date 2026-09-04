-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "usdInvoiceNumberFormat" TEXT NOT NULL DEFAULT 'TG/EXP/{FY}/{seq}';
