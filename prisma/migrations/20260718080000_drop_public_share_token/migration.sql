-- DropIndex
DROP INDEX "Invoice_publicShareToken_key";

-- AlterTable
ALTER TABLE "Invoice" DROP COLUMN "publicShareToken";
