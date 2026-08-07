-- AlterTable
ALTER TABLE "StockCheckFinishedItem" ADD COLUMN     "price" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "StockCheckItem" ADD COLUMN     "loosePrice" DECIMAL(18,2),
ADD COLUMN     "wholePrice" DECIMAL(18,2);
