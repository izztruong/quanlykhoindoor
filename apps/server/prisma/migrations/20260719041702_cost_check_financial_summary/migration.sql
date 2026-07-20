-- CreateEnum
CREATE TYPE "FinishedGoodCategory" AS ENUM ('TRA', 'DAV');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('NVL', 'COC_TAKE', 'BANH', 'DUNG_CU', 'KHAC');

-- AlterTable
ALTER TABLE "CostCheck" ADD COLUMN     "discountDav" DECIMAL(18,2),
ADD COLUMN     "discountTra" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "FinishedGoodItem" ADD COLUMN     "category" "FinishedGoodCategory",
ADD COLUMN     "sellingPrice" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'NVL';
