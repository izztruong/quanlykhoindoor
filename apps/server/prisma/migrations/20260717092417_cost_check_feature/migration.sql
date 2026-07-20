-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "recipeUnitName" TEXT,
ADD COLUMN     "recipeUnitsPerBaseUnit" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinishedGoodRecipeItem" (
    "id" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerUnit" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "FinishedGoodRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialWaste" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialWaste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialWasteItem" (
    "id" TEXT NOT NULL,
    "materialWasteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "wholeQuantity" DECIMAL(18,3),
    "looseQuantity" DECIMAL(18,3),
    "note" TEXT,

    CONSTRAINT "MaterialWasteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCheck" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openingStockCheckId" TEXT NOT NULL,
    "closingStockCheckId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCheckSoldItem" (
    "id" TEXT NOT NULL,
    "costCheckId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantitySold" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "CostCheckSoldItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodRecipeItem_finishedGoodItemId_productId_key" ON "FinishedGoodRecipeItem"("finishedGoodItemId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialWaste_code_key" ON "MaterialWaste"("code");

-- CreateIndex
CREATE INDEX "MaterialWasteItem_productId_idx" ON "MaterialWasteItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCheck_code_key" ON "CostCheck"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCheckSoldItem_costCheckId_finishedGoodItemId_key" ON "CostCheckSoldItem"("costCheckId", "finishedGoodItemId");

-- AddForeignKey
ALTER TABLE "FinishedGoodRecipeItem" ADD CONSTRAINT "FinishedGoodRecipeItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodRecipeItem" ADD CONSTRAINT "FinishedGoodRecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWaste" ADD CONSTRAINT "MaterialWaste_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWasteItem" ADD CONSTRAINT "MaterialWasteItem_materialWasteId_fkey" FOREIGN KEY ("materialWasteId") REFERENCES "MaterialWaste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWasteItem" ADD CONSTRAINT "MaterialWasteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheck" ADD CONSTRAINT "CostCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheck" ADD CONSTRAINT "CostCheck_openingStockCheckId_fkey" FOREIGN KEY ("openingStockCheckId") REFERENCES "StockCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheck" ADD CONSTRAINT "CostCheck_closingStockCheckId_fkey" FOREIGN KEY ("closingStockCheckId") REFERENCES "StockCheck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheck" ADD CONSTRAINT "CostCheck_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheckSoldItem" ADD CONSTRAINT "CostCheckSoldItem_costCheckId_fkey" FOREIGN KEY ("costCheckId") REFERENCES "CostCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCheckSoldItem" ADD CONSTRAINT "CostCheckSoldItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
