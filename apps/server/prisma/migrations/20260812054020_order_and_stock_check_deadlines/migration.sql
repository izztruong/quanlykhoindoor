-- CreateEnum
CREATE TYPE "DeadlineKind" AS ENUM ('SALES_ORDER', 'STOCK_CHECK_WEEKLY', 'STOCK_CHECK_MONTHLY');

-- CreateEnum
CREATE TYPE "StockCheckType" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "isLate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StockCheck" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "isLate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "StockCheckType";

-- CreateTable
CREATE TABLE "Deadline" (
    "id" TEXT NOT NULL,
    "kind" "DeadlineKind" NOT NULL,
    "weekday" INTEGER,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deadline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_kind_key" ON "Deadline"("kind");
