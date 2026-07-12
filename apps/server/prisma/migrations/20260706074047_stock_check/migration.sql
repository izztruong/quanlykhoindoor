-- CreateTable
CREATE TABLE "StockCheck" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "checkDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCheckItem" (
    "id" TEXT NOT NULL,
    "stockCheckId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "StockCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCheck_code_key" ON "StockCheck"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockCheckItem_stockCheckId_productId_key" ON "StockCheckItem"("stockCheckId", "productId");

-- AddForeignKey
ALTER TABLE "StockCheck" ADD CONSTRAINT "StockCheck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCheckItem" ADD CONSTRAINT "StockCheckItem_stockCheckId_fkey" FOREIGN KEY ("stockCheckId") REFERENCES "StockCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCheckItem" ADD CONSTRAINT "StockCheckItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
