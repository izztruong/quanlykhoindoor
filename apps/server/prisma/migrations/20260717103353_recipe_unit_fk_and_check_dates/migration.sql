-- AlterTable
ALTER TABLE "MaterialWaste" ADD COLUMN     "wasteAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "recipeUnitId" TEXT;

-- AlterTable
ALTER TABLE "StockCheck" ADD COLUMN     "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_recipeUnitId_fkey" FOREIGN KEY ("recipeUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: for rows that already existed before this column existed, the real-world
-- moment they represent is their createdAt (there was no separate date/time picker yet).
UPDATE "MaterialWaste" SET "wasteAt" = "createdAt";
UPDATE "StockCheck" SET "checkedAt" = "createdAt";
