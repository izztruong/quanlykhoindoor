-- Dọn phần kho cũ. Sau khi phiếu nhập kho của quán thành đường ghi chính và đơn hàng chỉ còn là đề
-- xuất, những thứ này không còn ai đọc hay ghi:
--
--  * StockExport/StockExportItem — 185 phiếu, TOÀN BỘ do bước xử lý đơn (đã bỏ) tự sinh. Chỉ 4/1103
--    dòng từng khai NCC và 5/1103 có giá > 0, tức chưa bao giờ được dùng để ghi giá.
--  * InventoryCount/InventoryCountItem — 0 dòng, chưa ai kiểm kê kho lần nào.
--  * Customer — 1 dòng; chỉ phiếu nhập/xuất từng trỏ tới, cả hai đường đã bỏ trường khách hàng.
--  * Kho tổng KHO01 — mọi đơn hàng từng trỏ vào nó đã bỏ cột warehouseId ở migration trước.
--
-- Kéo theo nhóm báo cáo Kiểm toán (5 trang) vì 3/5 báo cáo mất nguồn và 2 báo cáo nhập còn lại đã
-- được thay bằng chính danh sách phiếu nhập.

-- DropForeignKey
ALTER TABLE "InventoryCount" DROP CONSTRAINT "InventoryCount_createdById_fkey";
ALTER TABLE "InventoryCount" DROP CONSTRAINT "InventoryCount_warehouseId_fkey";
ALTER TABLE "InventoryCountItem" DROP CONSTRAINT "InventoryCountItem_inventoryCountId_fkey";
ALTER TABLE "InventoryCountItem" DROP CONSTRAINT "InventoryCountItem_productId_fkey";
ALTER TABLE "StockExport" DROP CONSTRAINT "StockExport_customerId_fkey";
ALTER TABLE "StockExport" DROP CONSTRAINT "StockExport_salesOrderId_fkey";
ALTER TABLE "StockExport" DROP CONSTRAINT "StockExport_supplierId_fkey";
ALTER TABLE "StockExport" DROP CONSTRAINT "StockExport_warehouseId_fkey";
ALTER TABLE "StockExportItem" DROP CONSTRAINT "StockExportItem_productId_fkey";
ALTER TABLE "StockExportItem" DROP CONSTRAINT "StockExportItem_stockExportId_fkey";
ALTER TABLE "StockExportItem" DROP CONSTRAINT "StockExportItem_supplierId_fkey";

-- AlterTable
-- Bỏ DEFAULT của updatedAt: nó chỉ cần cho migration 20261012000400 chèn phiếu bằng SQL thô, mà
-- migration đó chạy TRƯỚC file này. Giữ lại thì schema.prisma và DB lệch nhau, và mọi lần
-- `prisma migrate diff` về sau đều báo drift.
ALTER TABLE "StockImport" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "StockExportItem";
DROP TABLE "StockExport";
DROP TABLE "InventoryCountItem";
DROP TABLE "InventoryCount";
DROP TABLE "Customer";

-- DropEnum
DROP TYPE "InventoryCountStatus";
DROP TYPE "StockExportType";

-- Kho tổng cũ. Chỉ xoá khi KHÔNG còn phiếu nhập nào trỏ tới — đã gặp thật trên bản copy dữ liệu:
-- có một phiếu nhập cũ (gõ thử, không thuộc quán nào) nằm trong KHO01, và `DELETE` vô điều kiện làm
-- cả migration vỡ vì FK Restrict.
--
-- KHÔNG xoá phiếu đó ở đây: xoá dữ liệu người dùng trong migration là việc không hoàn tác được, mà
-- phiếu này Check Cost vốn chưa bao giờ tính (kho không có quán). Kho nào còn phiếu thì đổi tên cho
-- rõ vai trò và để lại — xoá phiếu rồi xoá kho làm được ngay trên giao diện.
DELETE FROM "Warehouse" w
WHERE w."code" = 'KHO01'
  AND NOT EXISTS (SELECT 1 FROM "StockImport" si WHERE si."warehouseId" = w.id);

UPDATE "Warehouse" SET "name" = 'Kho tổng (cũ)'
WHERE "code" = 'KHO01' AND "shopUserId" IS NULL;

-- Gỡ mã quyền của chức năng đã bỏ khỏi mọi vai trò (khuôn 20261006082208_simplify_sales_order_flow).
-- COALESCE là BẮT BUỘC: array_agg trả NULL khi lọc sạch, mà cột là String[] NOT NULL.
UPDATE "Role" SET "permissions" = COALESCE((
  SELECT array_agg(p ORDER BY p) FROM unnest("permissions") p
  WHERE p NOT LIKE 'AUDIT_REPORTS.%'
    AND p NOT LIKE 'STOCK_EXPORTS.%'
    AND p NOT LIKE 'INVENTORY_COUNTS.%'
    AND p NOT LIKE 'CUSTOMERS.%'
), '{}');
