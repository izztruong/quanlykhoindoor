-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN     "receivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SalesOrderItem_receivedAt_idx" ON "SalesOrderItem"("receivedAt");

-- Backfill: chép mốc hoàn thành của đơn xuống từng dòng, giữ nguyên hành vi Check Cost cho dữ
-- liệu lịch sử. Không có bước này thì mọi đơn hàng cũ sẽ biến mất khỏi phần "nhận trong kỳ",
-- vì Check Cost chuyển sang lọc theo SalesOrderItem."receivedAt" thay cho SalesOrder."completedAt".
UPDATE "SalesOrderItem" i
SET "receivedAt" = o."completedAt"
FROM "SalesOrder" o
WHERE i."salesOrderId" = o.id
  AND o."completedAt" IS NOT NULL
  AND i."receivedAt" IS NULL;
