-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "templateId";

-- AlterTable
ALTER TABLE "BusinessProfile" DROP COLUMN "defaultTemplateId";

-- DropEnum
DROP TYPE "InvoiceTemplate";
