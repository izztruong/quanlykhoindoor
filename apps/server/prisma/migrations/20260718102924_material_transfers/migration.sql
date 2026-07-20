-- CreateTable
CREATE TABLE "MaterialTransfer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "transferAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialTransferItem" (
    "id" TEXT NOT NULL,
    "materialTransferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "wholeQuantity" DECIMAL(18,3),
    "looseQuantity" DECIMAL(18,3),
    "supplierId" TEXT,
    "costPrice" DECIMAL(18,2),
    "note" TEXT,

    CONSTRAINT "MaterialTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialTransfer_code_key" ON "MaterialTransfer"("code");

-- CreateIndex
CREATE INDEX "MaterialTransferItem_productId_idx" ON "MaterialTransferItem"("productId");

-- AddForeignKey
ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransfer" ADD CONSTRAINT "MaterialTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransferItem" ADD CONSTRAINT "MaterialTransferItem_materialTransferId_fkey" FOREIGN KEY ("materialTransferId") REFERENCES "MaterialTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransferItem" ADD CONSTRAINT "MaterialTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialTransferItem" ADD CONSTRAINT "MaterialTransferItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
