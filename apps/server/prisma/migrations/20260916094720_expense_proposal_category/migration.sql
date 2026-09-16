-- CreateEnum
CREATE TYPE "ExpenseProposalCategory" AS ENUM ('MKT', 'OPERATION', 'FACILITY');

-- AlterTable
ALTER TABLE "ExpenseProposal" ADD COLUMN     "category" "ExpenseProposalCategory";

-- CreateIndex
CREATE INDEX "ExpenseProposal_category_idx" ON "ExpenseProposal"("category");
