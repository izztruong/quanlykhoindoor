-- CreateEnum
CREATE TYPE "CostCheckStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "CostCheck" ADD COLUMN     "status" "CostCheckStatus" NOT NULL DEFAULT 'ACTIVE';
