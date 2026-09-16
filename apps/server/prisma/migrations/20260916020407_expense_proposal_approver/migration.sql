-- AlterTable
ALTER TABLE "ExpenseProposal" ADD COLUMN     "approverId" TEXT;

-- CreateIndex
CREATE INDEX "ExpenseProposal_approverId_idx" ON "ExpenseProposal"("approverId");

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
