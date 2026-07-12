-- CreateTable
CREATE TABLE "ProductSupplierPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "importPrice" DECIMAL(18,2) NOT NULL,
    "exportPrice" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplierPrice_productId_supplierId_key" ON "ProductSupplierPrice"("productId", "supplierId");

-- AddForeignKey
ALTER TABLE "ProductSupplierPrice" ADD CONSTRAINT "ProductSupplierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplierPrice" ADD CONSTRAINT "ProductSupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StockExportItem" ADD COLUMN "supplierId" TEXT;

-- AddForeignKey
ALTER TABLE "StockExportItem" ADD CONSTRAINT "StockExportItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
