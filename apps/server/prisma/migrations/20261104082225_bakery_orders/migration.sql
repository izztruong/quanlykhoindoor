-- CreateEnum
CREATE TYPE "BakeryOrderStatus" AS ENUM ('ORDERED', 'CONFIRMED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "StockImport" ADD COLUMN     "bakeryOrderId" TEXT;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "bakeryUserId" TEXT;

-- CreateTable
CREATE TABLE "BakeryOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BakeryOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "shopUserId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "deliveryOn" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "pickedUpById" TEXT,
    "pickedUpAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "BakeryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BakeryOrderItem" (
    "id" TEXT NOT NULL,
    "bakeryOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderedQty" DECIMAL(18,3) NOT NULL,
    "confirmedQty" DECIMAL(18,3),
    "pickedUpQty" DECIMAL(18,3),
    "receivedQty" DECIMAL(18,3),
    "unitPrice" DECIMAL(18,2),
    "note" TEXT,

    CONSTRAINT "BakeryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BakeryOrder_code_key" ON "BakeryOrder"("code");

-- CreateIndex
CREATE INDEX "BakeryOrder_shopUserId_createdAt_idx" ON "BakeryOrder"("shopUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BakeryOrder_supplierId_status_idx" ON "BakeryOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX "BakeryOrder_status_deliveryOn_idx" ON "BakeryOrder"("status", "deliveryOn");

-- CreateIndex
CREATE INDEX "BakeryOrderItem_productId_idx" ON "BakeryOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BakeryOrderItem_bakeryOrderId_productId_key" ON "BakeryOrderItem"("bakeryOrderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockImport_bakeryOrderId_key" ON "StockImport"("bakeryOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_bakeryUserId_key" ON "Supplier"("bakeryUserId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_bakeryUserId_fkey" FOREIGN KEY ("bakeryUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImport" ADD CONSTRAINT "StockImport_bakeryOrderId_fkey" FOREIGN KEY ("bakeryOrderId") REFERENCES "BakeryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_pickedUpById_fkey" FOREIGN KEY ("pickedUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrder" ADD CONSTRAINT "BakeryOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrderItem" ADD CONSTRAINT "BakeryOrderItem_bakeryOrderId_fkey" FOREIGN KEY ("bakeryOrderId") REFERENCES "BakeryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakeryOrderItem" ADD CONSTRAINT "BakeryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

