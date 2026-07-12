-- AlterEnum
ALTER TYPE "SalesOrderStatus" ADD VALUE 'SHORT';

-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN "received" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "receivedQuantity" DECIMAL(18,3);
