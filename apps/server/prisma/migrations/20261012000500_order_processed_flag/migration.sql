-- Đơn hàng chỉ còn là ĐỀ XUẤT của quán. Mọi thứ về "nhận bao nhiêu, lúc nào, chứng từ đâu" đã chuyển
-- sang phiếu nhập kho của quán (migration 20261012000400). Thay vào đó đơn có ô tích "Đã xử lý" để
-- admin biết đơn nào đã làm — một thao tác đơn thuần, không nhập SL, không sinh phiếu nào.

-- `completedAt` vốn mang đúng nghĩa "admin đã xử lý xong đơn này", nên ĐỔI TÊN chứ không xoá rồi thêm
-- cột mới: 185 đơn cũ giữ nguyên mốc và ô tích hiện đúng ngay sau migration.
--
-- Prisma tự sinh ra cặp DROP COLUMN "completedAt" + ADD COLUMN "processedAt" (nó không biết đây là
-- đổi tên) — dùng nguyên là mất sạch mốc của 185 đơn. Dòng dưới đây thay cho cặp đó.
ALTER TABLE "SalesOrder" RENAME COLUMN "completedAt" TO "processedAt";

-- Không biết ai đã xử lý các đơn cũ, để NULL chứ không bịa.
ALTER TABLE "SalesOrder" ADD COLUMN "processedById" TEXT;

-- Phải chạy TRƯỚC khi thu enum: còn dòng 'COMPLETED' thì phép ::text::SalesOrderStatus_new nổ.
-- Đơn đã xử lý không mất dấu — nó nằm ở processedAt vừa đổi tên ở trên.
UPDATE "SalesOrder" SET "status" = 'DRAFT' WHERE "status" = 'COMPLETED';

-- AlterEnum
BEGIN;
CREATE TYPE "SalesOrderStatus_new" AS ENUM ('DRAFT', 'CANCELLED');
ALTER TABLE "public"."SalesOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SalesOrder" ALTER COLUMN "status" TYPE "SalesOrderStatus_new" USING ("status"::text::"SalesOrderStatus_new");
ALTER TYPE "SalesOrderStatus" RENAME TO "SalesOrderStatus_old";
ALTER TYPE "SalesOrderStatus_new" RENAME TO "SalesOrderStatus";
DROP TYPE "public"."SalesOrderStatus_old";
ALTER TABLE "SalesOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "SalesOrder" DROP CONSTRAINT "SalesOrder_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "SalesOrderItemImage" DROP CONSTRAINT "SalesOrderItemImage_salesOrderItemId_fkey";

-- DropIndex
DROP INDEX "SalesOrder_createdById_completedAt_idx";

-- DropIndex
DROP INDEX "SalesOrderItem_receivedAt_idx";

-- AlterTable
-- `warehouseId` bỏ hẳn: hai người đọc duy nhất là chốt tồn lúc tạo đơn (đã gỡ, web vốn luôn gửi
-- skipStockCheck) và phiếu xuất kho (sắp xoá). Giữ lại là nuôi một ô "Kho hàng" trên phiếu đặt mà
-- không ai dùng, và kho tổng KHO01 phải sống mãi vì còn đơn trỏ vào.
ALTER TABLE "SalesOrder" DROP COLUMN "warehouseId";

-- AlterTable
ALTER TABLE "SalesOrderItem" DROP COLUMN "note",
DROP COLUMN "received",
DROP COLUMN "receivedAt",
DROP COLUMN "receivedQuantity";

-- DropTable
-- Đã kiểm trên dữ liệu thật: 0 dòng, nên không có file R2 nào phải dọn trước khi xoá bảng.
DROP TABLE "SalesOrderItemImage";

-- CreateIndex
CREATE INDEX "SalesOrder_createdById_processedAt_idx" ON "SalesOrder"("createdById", "processedAt");

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
