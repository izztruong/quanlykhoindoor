-- AlterTable
ALTER TABLE "InventoryCount" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "StockExport" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "StockImport" ADD COLUMN     "createdById" TEXT;
