-- AlterTable
ALTER TABLE "OtherExpense" ADD COLUMN     "shopId" TEXT;

-- CreateIndex
CREATE INDEX "OtherExpense_shopId_spentAt_idx" ON "OtherExpense"("shopId", "spentAt");

-- AddForeignKey
ALTER TABLE "OtherExpense" ADD CONSTRAINT "OtherExpense_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
