-- CreateTable
CREATE TABLE "FinishedGoodItem" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedGoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodItem_code_key" ON "FinishedGoodItem"("code");

-- AddForeignKey
ALTER TABLE "FinishedGoodItem" ADD CONSTRAINT "FinishedGoodItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: StockCheckItem quantity -> wholeQuantity/looseQuantity (both optional)
ALTER TABLE "StockCheckItem" ADD COLUMN "wholeQuantity" DECIMAL(18,3);
ALTER TABLE "StockCheckItem" ADD COLUMN "looseQuantity" DECIMAL(18,3);
UPDATE "StockCheckItem" SET "wholeQuantity" = "quantity";
ALTER TABLE "StockCheckItem" DROP COLUMN "quantity";

-- CreateTable
CREATE TABLE "StockCheckFinishedItem" (
    "id" TEXT NOT NULL,
    "stockCheckId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "StockCheckFinishedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockCheckFinishedItem_stockCheckId_finishedGoodItemId_key" ON "StockCheckFinishedItem"("stockCheckId", "finishedGoodItemId");

-- AddForeignKey
ALTER TABLE "StockCheckFinishedItem" ADD CONSTRAINT "StockCheckFinishedItem_stockCheckId_fkey" FOREIGN KEY ("stockCheckId") REFERENCES "StockCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCheckFinishedItem" ADD CONSTRAINT "StockCheckFinishedItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
