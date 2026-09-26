-- Màn theo dõi cuối ngày (Bước 3).
--
-- Kết quả lưu lại chứ không tính lúc mở màn: mở màn phải nhanh, và giữ lịch sử "ngày nào hệ thống đã
-- cảnh báo gì" là cách duy nhất về sau đo được nó có báo đúng không.
--
-- businessDate là UNIQUE: GitHub Actions có thể chạy lại khi lỗi mạng, chạy lần hai phải ghi đè chứ
-- không nhân đôi kết quả.
--
-- Chỉ tạo bảng và thêm giá trị enum, KHÔNG chèn hay sửa dữ liệu nào.

-- CreateEnum
CREATE TYPE "DailyWatchKind" AS ENUM ('SHORTFALL', 'TRANSFER', 'FREE_SHIP_READY', 'ORDER_DUE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MATERIAL_RUNNING_OUT';
ALTER TYPE "NotificationType" ADD VALUE 'TRANSFER_SUGGESTED';

-- CreateTable
CREATE TABLE "DailyWatchRun" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL,
    "triggeredById" TEXT,
    "shopCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "DailyWatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWatchFinding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" "DailyWatchKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT,
    "supplierId" TEXT,
    "fromUserId" TEXT,
    "daysLeft" DECIMAL(10,2),
    "daysToOrder" INTEGER,
    "quantity" DECIMAL(18,3),
    "amount" DECIMAL(18,2),
    "freeTransfer" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "reasons" JSONB NOT NULL,

    CONSTRAINT "DailyWatchFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWatchRun_businessDate_key" ON "DailyWatchRun"("businessDate");

-- CreateIndex
CREATE INDEX "DailyWatchRun_businessDate_idx" ON "DailyWatchRun"("businessDate");

-- CreateIndex
CREATE INDEX "DailyWatchFinding_runId_kind_idx" ON "DailyWatchFinding"("runId", "kind");

-- CreateIndex
CREATE INDEX "DailyWatchFinding_userId_idx" ON "DailyWatchFinding"("userId");

-- CreateIndex
CREATE INDEX "DailyWatchFinding_productId_idx" ON "DailyWatchFinding"("productId");

-- AddForeignKey
ALTER TABLE "DailyWatchRun" ADD CONSTRAINT "DailyWatchRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWatchFinding" ADD CONSTRAINT "DailyWatchFinding_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyWatchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWatchFinding" ADD CONSTRAINT "DailyWatchFinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWatchFinding" ADD CONSTRAINT "DailyWatchFinding_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWatchFinding" ADD CONSTRAINT "DailyWatchFinding_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWatchFinding" ADD CONSTRAINT "DailyWatchFinding_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

