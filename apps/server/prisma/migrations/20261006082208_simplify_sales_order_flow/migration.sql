-- Bỏ bước xác nhận đơn: chỉ còn DRAFT (chưa xử lý) -> COMPLETED / CANCELLED, admin tự ghi SL và
-- ngày nhận. Mọi đơn đang ở PENDING_CONFIRM / CONFIRMED / SHORT chuyển thành COMPLETED, SL nhận
-- lấy theo phiếu xuất đã sinh lúc xác nhận (phiếu xuất là thứ đã trừ tồn kho thật).

-- 1. Dòng chưa có SL nhận: lấy tổng SL phiếu xuất của cùng (đơn, hàng hoá), không có thì 0.
UPDATE "SalesOrderItem" AS i
SET "receivedQuantity" = COALESCE((
      SELECT SUM(ei."quantity")
      FROM "StockExport" e
      JOIN "StockExportItem" ei ON ei."stockExportId" = e.id
      WHERE e."salesOrderId" = i."salesOrderId" AND ei."productId" = i."productId"
    ), 0)
FROM "SalesOrder" s
WHERE s.id = i."salesOrderId"
  AND s."status" IN ('PENDING_CONFIRM', 'CONFIRMED', 'SHORT')
  AND i."receivedQuantity" IS NULL;

-- 2. Dòng chưa có ngày nhận: lấy ngày phiếu xuất, rơi về ngày tạo đơn nếu đơn không có phiếu xuất.
UPDATE "SalesOrderItem" AS i
SET "receivedAt" = COALESCE(
      (SELECT e."transactionAt" FROM "StockExport" e WHERE e."salesOrderId" = i."salesOrderId"),
      s."createdAt"
    )
FROM "SalesOrder" s
WHERE s.id = i."salesOrderId"
  AND s."status" IN ('PENDING_CONFIRM', 'CONFIRMED', 'SHORT')
  AND i."receivedAt" IS NULL;

UPDATE "SalesOrderItem" AS i
SET "received" = (i."receivedQuantity" >= i."quantity")
FROM "SalesOrder" s
WHERE s.id = i."salesOrderId"
  AND s."status" IN ('PENDING_CONFIRM', 'CONFIRMED', 'SHORT');

-- 3. Đóng đơn.
UPDATE "SalesOrder" AS s
SET "status" = 'COMPLETED',
    "completedAt" = COALESCE(
      s."completedAt",
      (SELECT e."transactionAt" FROM "StockExport" e WHERE e."salesOrderId" = s.id),
      s."createdAt"
    )
WHERE s."status" IN ('PENDING_CONFIRM', 'CONFIRMED', 'SHORT');

-- 4. Enum trạng thái chỉ còn 3 giá trị.
CREATE TYPE "SalesOrderStatus_new" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
ALTER TABLE "SalesOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SalesOrder" ALTER COLUMN "status" TYPE "SalesOrderStatus_new" USING ("status"::text::"SalesOrderStatus_new");
ALTER TYPE "SalesOrderStatus" RENAME TO "SalesOrderStatus_old";
ALTER TYPE "SalesOrderStatus_new" RENAME TO "SalesOrderStatus";
DROP TYPE "SalesOrderStatus_old";
ALTER TABLE "SalesOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- 5. Thông báo: "đơn đã xác nhận" thành "đơn đã được xử lý"; bỏ hẳn "nhận hàng thiếu".
ALTER TYPE "NotificationType" RENAME VALUE 'ORDER_CONFIRMED' TO 'ORDER_COMPLETED';
DELETE FROM "Notification" WHERE "type" = 'ORDER_SHORT';
DELETE FROM "NotificationPreference" WHERE "type" = 'ORDER_SHORT';
CREATE TYPE "NotificationType_new" AS ENUM ('ORDER_CREATED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'EXPENSE_PROPOSAL_CREATED', 'EXPENSE_PROPOSAL_DECIDED', 'EXPENSE_PROPOSAL_PAID');
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TABLE "NotificationPreference" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";

-- 6. Quán không còn bước nhận hàng.
UPDATE "Role" SET "permissions" = array_remove("permissions", 'ORDERS.RECEIVE');
