-- AlterTable
ALTER TABLE "MaterialWasteItem" ADD COLUMN     "deductInCostCheck" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MaterialWasteFinishedItem" ADD COLUMN     "deductInCostCheck" BOOLEAN NOT NULL DEFAULT true;
