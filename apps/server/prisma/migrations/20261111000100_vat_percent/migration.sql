-- AlterTable
ALTER TABLE "CostCheck" ADD COLUMN     "useVat" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinishedGoodItem" ADD COLUMN     "vatPercent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "vatPercent" DECIMAL(5,2);
