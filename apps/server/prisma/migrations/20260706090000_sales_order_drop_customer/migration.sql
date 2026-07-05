-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_customerId_fkey";

-- AlterTable
ALTER TABLE "SalesOrder" DROP COLUMN "customerId";
