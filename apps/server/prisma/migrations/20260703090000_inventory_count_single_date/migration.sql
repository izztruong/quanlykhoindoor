-- DropIndex
DROP INDEX "InventoryCount_warehouseId_periodStart_periodEnd_idx";

-- AlterTable: collapse period range into a single count date
ALTER TABLE "InventoryCount" RENAME COLUMN "periodStart" TO "countDate";
ALTER TABLE "InventoryCount" DROP COLUMN "periodEnd";

-- AlterTable: per-item note
ALTER TABLE "InventoryCountItem" ADD COLUMN "note" TEXT;

-- CreateIndex
CREATE INDEX "InventoryCount_warehouseId_countDate_idx" ON "InventoryCount"("warehouseId", "countDate");

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
