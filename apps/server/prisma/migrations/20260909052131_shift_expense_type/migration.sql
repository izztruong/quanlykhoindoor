-- CreateEnum
CREATE TYPE "ShiftExpenseType" AS ENUM ('MATERIAL', 'OTHER');

-- AlterTable
ALTER TABLE "ShiftExpense" ADD COLUMN     "type" "ShiftExpenseType" NOT NULL DEFAULT 'MATERIAL';
