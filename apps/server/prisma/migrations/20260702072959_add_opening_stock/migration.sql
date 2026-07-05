-- CreateTable
CREATE TABLE "OpeningStock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpeningStock_warehouseId_productId_key" ON "OpeningStock"("warehouseId", "productId");

-- AddForeignKey
ALTER TABLE "OpeningStock" ADD CONSTRAINT "OpeningStock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningStock" ADD CONSTRAINT "OpeningStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
