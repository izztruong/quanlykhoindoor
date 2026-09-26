-- Chuẩn bị đồ thành phẩm theo ca (Bước 2).
--
-- Ba cột trên FinishedGoodItem là tính chất của MÓN (dùng chung mọi quán); mức mục tiêu thì theo
-- (quán × món × ca) ở ShiftPrepTarget — ca tối khác ca sáng, và mỗi quán một lượng khách.
--
-- Migration này chỉ tạo bảng và thêm cột nullable/có default, KHÔNG chèn hay sửa dữ liệu nào.

-- CreateEnum
CREATE TYPE "PrepMode" AS ENUM ('TARGET_LEVEL', 'FORECAST', 'OFF');

-- AlterTable
ALTER TABLE "FinishedGoodItem" ADD COLUMN     "batchSize" DECIMAL(18,3),
ADD COLUMN     "prepared" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shelfLifeHours" INTEGER;

-- CreateTable
CREATE TABLE "ShiftPrepTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "mode" "PrepMode" NOT NULL DEFAULT 'TARGET_LEVEL',
    "targetLevel" DECIMAL(18,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPrepTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftStockCount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ShiftStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftStockCountItem" (
    "id" TEXT NOT NULL,
    "shiftStockCountId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "ShiftStockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPrepRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftPrepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPrepRunItem" (
    "id" TEXT NOT NULL,
    "shiftPrepRunId" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "mode" "PrepMode" NOT NULL,
    "onHandQty" DECIMAL(18,3) NOT NULL,
    "demandQty" DECIMAL(18,3) NOT NULL,
    "suggestedQty" DECIMAL(18,3) NOT NULL,
    "suggestedBatches" INTEGER NOT NULL,
    "actualBatches" INTEGER,

    CONSTRAINT "ShiftPrepRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDayFactor" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "factor" DECIMAL(6,3) NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDayFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftPrepTarget_finishedGoodItemId_idx" ON "ShiftPrepTarget"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPrepTarget_userId_finishedGoodItemId_shift_key" ON "ShiftPrepTarget"("userId", "finishedGoodItemId", "shift");

-- CreateIndex
CREATE INDEX "ShiftStockCount_userId_businessDate_idx" ON "ShiftStockCount"("userId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftStockCount_userId_businessDate_shift_key" ON "ShiftStockCount"("userId", "businessDate", "shift");

-- CreateIndex
CREATE INDEX "ShiftStockCountItem_finishedGoodItemId_idx" ON "ShiftStockCountItem"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftStockCountItem_shiftStockCountId_finishedGoodItemId_key" ON "ShiftStockCountItem"("shiftStockCountId", "finishedGoodItemId");

-- CreateIndex
CREATE INDEX "ShiftPrepRun_userId_businessDate_idx" ON "ShiftPrepRun"("userId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPrepRun_userId_businessDate_shift_key" ON "ShiftPrepRun"("userId", "businessDate", "shift");

-- CreateIndex
CREATE INDEX "ShiftPrepRunItem_finishedGoodItemId_idx" ON "ShiftPrepRunItem"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftPrepRunItem_shiftPrepRunId_finishedGoodItemId_key" ON "ShiftPrepRunItem"("shiftPrepRunId", "finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDayFactor_date_key" ON "SalesDayFactor"("date");

-- AddForeignKey
ALTER TABLE "ShiftPrepTarget" ADD CONSTRAINT "ShiftPrepTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPrepTarget" ADD CONSTRAINT "ShiftPrepTarget_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftStockCount" ADD CONSTRAINT "ShiftStockCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftStockCount" ADD CONSTRAINT "ShiftStockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftStockCountItem" ADD CONSTRAINT "ShiftStockCountItem_shiftStockCountId_fkey" FOREIGN KEY ("shiftStockCountId") REFERENCES "ShiftStockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftStockCountItem" ADD CONSTRAINT "ShiftStockCountItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPrepRun" ADD CONSTRAINT "ShiftPrepRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPrepRun" ADD CONSTRAINT "ShiftPrepRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPrepRunItem" ADD CONSTRAINT "ShiftPrepRunItem_shiftPrepRunId_fkey" FOREIGN KEY ("shiftPrepRunId") REFERENCES "ShiftPrepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPrepRunItem" ADD CONSTRAINT "ShiftPrepRunItem_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

