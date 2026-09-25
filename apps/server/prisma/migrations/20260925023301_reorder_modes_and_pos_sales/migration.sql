-- CreateEnum
CREATE TYPE "ReorderMode" AS ENUM ('THRESHOLD', 'FIXED', 'COVERAGE', 'OFF');

-- CreateEnum
CREATE TYPE "DailyUsageSource" AS ENUM ('COST_CHECK', 'RECEIVED', 'NONE');

-- CreateEnum
CREATE TYPE "ShiftCode" AS ENUM ('CA1', 'CA2', 'CA3');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "shelfLifeDays" INTEGER;

-- AlterTable
ALTER TABLE "ProductReorderThreshold" ADD COLUMN     "coverDays" INTEGER,
ADD COLUMN     "fixedQuantity" DECIMAL(18,3),
ADD COLUMN     "mode" "ReorderMode" NOT NULL DEFAULT 'THRESHOLD',
ALTER COLUMN "minQuantity" DROP NOT NULL,
ALTER COLUMN "maxQuantity" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ReorderRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coverDays" INTEGER,
    "salesOrderId" TEXT,

    CONSTRAINT "ReorderRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReorderRunItem" (
    "id" TEXT NOT NULL,
    "reorderRunId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mode" "ReorderMode" NOT NULL,
    "onHandQty" DECIMAL(18,3) NOT NULL,
    "dailyUsage" DECIMAL(18,4),
    "usageSource" "DailyUsageSource" NOT NULL,
    "suggestedQty" DECIMAL(18,3) NOT NULL,
    "orderedQty" DECIMAL(18,3),

    CONSTRAINT "ReorderRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleHour" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soldOn" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "PosSaleHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosItemMapping" (
    "id" TEXT NOT NULL,
    "posName" TEXT NOT NULL,
    "posNameRaw" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftDefinition" (
    "id" TEXT NOT NULL,
    "code" "ShiftCode" NOT NULL,
    "name" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReorderRun_salesOrderId_key" ON "ReorderRun"("salesOrderId");

-- CreateIndex
CREATE INDEX "ReorderRun_userId_createdAt_idx" ON "ReorderRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReorderRunItem_productId_idx" ON "ReorderRunItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderRunItem_reorderRunId_productId_key" ON "ReorderRunItem"("reorderRunId", "productId");

-- CreateIndex
CREATE INDEX "PosSaleHour_userId_soldOn_idx" ON "PosSaleHour"("userId", "soldOn");

-- CreateIndex
CREATE INDEX "PosSaleHour_finishedGoodItemId_idx" ON "PosSaleHour"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSaleHour_userId_soldOn_hour_finishedGoodItemId_key" ON "PosSaleHour"("userId", "soldOn", "hour", "finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PosItemMapping_posName_key" ON "PosItemMapping"("posName");

-- CreateIndex
CREATE INDEX "PosItemMapping_finishedGoodItemId_idx" ON "PosItemMapping"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDefinition_code_key" ON "ShiftDefinition"("code");

-- AddForeignKey
ALTER TABLE "ReorderRun" ADD CONSTRAINT "ReorderRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRun" ADD CONSTRAINT "ReorderRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRun" ADD CONSTRAINT "ReorderRun_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRunItem" ADD CONSTRAINT "ReorderRunItem_reorderRunId_fkey" FOREIGN KEY ("reorderRunId") REFERENCES "ReorderRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReorderRunItem" ADD CONSTRAINT "ReorderRunItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleHour" ADD CONSTRAINT "PosSaleHour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleHour" ADD CONSTRAINT "PosSaleHour_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosItemMapping" ADD CONSTRAINT "PosItemMapping_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
