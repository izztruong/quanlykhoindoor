-- Phiếu nhập kho thành đường ghi chính thức cho "hàng về quán": thêm ảnh chứng từ THEO PHIẾU, mốc
-- sửa đổi, và khoá ngoại người tạo. Bỏ trường khách hàng (phiếu nhập không bán cho ai).

-- Thu enum: bỏ CUSTOMER_RETURN (không còn khách hàng) và TRANSFER_IN — hàng chuyển giữa các quán đã
-- có module Phiếu điều chuyển, mà Check Cost cộng cột đó RIÊNG, nên để lại là một lần chuyển được
-- tính vào CẢ HAI cột. Đã kiểm dữ liệu thật: 177/177 phiếu là PURCHASE nên phép ::text::… không nổ.
BEGIN;
CREATE TYPE "StockImportType_new" AS ENUM ('PURCHASE', 'OTHER');
ALTER TABLE "public"."StockImport" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "StockImport" ALTER COLUMN "type" TYPE "StockImportType_new" USING ("type"::text::"StockImportType_new");
ALTER TYPE "StockImportType" RENAME TO "StockImportType_old";
ALTER TYPE "StockImportType_new" RENAME TO "StockImportType";
DROP TYPE "public"."StockImportType_old";
ALTER TABLE "StockImport" ALTER COLUMN "type" SET DEFAULT 'PURCHASE';
COMMIT;

-- DropForeignKey
ALTER TABLE "StockImport" DROP CONSTRAINT "StockImport_customerId_fkey";

-- AlterTable
-- DEFAULT là BẮT BUỘC, hai lý do: bảng đã có 177 dòng nên NOT NULL không default sẽ vỡ ngay; và
-- migration sinh phiếu từ SL nhận cũ (20261012000400) chèn bằng SQL thô, không truyền updatedAt —
-- Prisma chỉ điền @updatedAt ở phía client.
ALTER TABLE "StockImport" DROP COLUMN "customerId",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "StockImportImage" (
    "id" TEXT NOT NULL,
    "stockImportId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockImportImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockImportImage_objectKey_key" ON "StockImportImage"("objectKey");

-- CreateIndex
CREATE INDEX "StockImportImage_stockImportId_idx" ON "StockImportImage"("stockImportId");

-- AddForeignKey
ALTER TABLE "StockImportImage" ADD CONSTRAINT "StockImportImage_stockImportId_fkey" FOREIGN KEY ("stockImportId") REFERENCES "StockImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- `createdById` trước đây là cột trơ không có quan hệ, nên danh sách phiếu không hiện được người gõ.
ALTER TABLE "StockImport" ADD CONSTRAINT "StockImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
