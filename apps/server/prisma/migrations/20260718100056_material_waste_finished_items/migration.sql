-- CreateTable
CREATE TABLE "MaterialWasteFinishedItem" (
    "id" TEXT NOT NULL,
    "materialWasteId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "MaterialWasteFinishedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialWasteFinishedItem_materialWasteId_finishedGoodItemI_key" ON "MaterialWasteFinishedItem"("materialWasteId", "finishedGoodItemId");

-- AddForeignKey
ALTER TABLE "MaterialWasteFinishedItem" ADD CONSTRAINT "MaterialWasteFinishedItem_materialWasteId_fkey" FOREIGN KEY ("materialWasteId") REFERENCES "MaterialWaste"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialWasteFinishedItem" ADD CONSTRAINT "MaterialWasteFinishedItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
