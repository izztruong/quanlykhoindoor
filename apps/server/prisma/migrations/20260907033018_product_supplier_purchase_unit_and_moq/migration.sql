-- AlterTable
ALTER TABLE "ProductSupplierPrice" ADD COLUMN     "baseUnitsPerPurchaseUnit" DECIMAL(18,4),
ADD COLUMN     "minQuantity" DECIMAL(18,3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purchaseUnitId" TEXT;

-- CreateIndex
CREATE INDEX "ProductSupplierPrice_purchaseUnitId_idx" ON "ProductSupplierPrice"("purchaseUnitId");

-- AddForeignKey
ALTER TABLE "ProductSupplierPrice" ADD CONSTRAINT "ProductSupplierPrice_purchaseUnitId_fkey" FOREIGN KEY ("purchaseUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
