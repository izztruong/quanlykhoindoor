-- CreateEnum
CREATE TYPE "ExpenseProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ADVANCED', 'SPENT');

-- CreateEnum
CREATE TYPE "ExpensePayer" AS ENUM ('CREATOR', 'ACCOUNTANT');

-- CreateTable
CREATE TABLE "ExpenseProposal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ExpenseProposalStatus" NOT NULL DEFAULT 'PENDING',
    "proposalDate" DATE NOT NULL,
    "payer" "ExpensePayer" NOT NULL,
    "shopName" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "advancePercent" DECIMAL(5,2),
    "advanceAmount" DECIMAL(18,2),
    "invoiceDueDate" DATE,
    "rejectReason" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "advancedById" TEXT,
    "advancedAt" TIMESTAMP(3),
    "spentById" TEXT,
    "spentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseProposalItem" (
    "id" TEXT NOT NULL,
    "expenseProposalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ExpenseProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseProposal_code_key" ON "ExpenseProposal"("code");

-- CreateIndex
CREATE INDEX "ExpenseProposal_createdById_proposalDate_idx" ON "ExpenseProposal"("createdById", "proposalDate");

-- CreateIndex
CREATE INDEX "ExpenseProposal_status_idx" ON "ExpenseProposal"("status");

-- CreateIndex
CREATE INDEX "ExpenseProposalItem_expenseProposalId_sortOrder_idx" ON "ExpenseProposalItem"("expenseProposalId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_advancedById_fkey" FOREIGN KEY ("advancedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_spentById_fkey" FOREIGN KEY ("spentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposalItem" ADD CONSTRAINT "ExpenseProposalItem_expenseProposalId_fkey" FOREIGN KEY ("expenseProposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vai trò "Quán" được lập, xem, sửa, xoá phiếu đề xuất chi của mình (sửa/xoá chỉ khi còn Chờ duyệt).
-- Duyệt (APPROVE) và xác nhận tạm ứng/đã chi (PAY) để admin tự cấp. Chỉ thêm mã còn thiếu, phòng
-- trường hợp vai trò đã được sửa tay trước khi migration này chạy.
UPDATE "Role"
SET "permissions" = "permissions" || ARRAY(
  SELECT code FROM unnest(ARRAY[
    'EXPENSE_PROPOSALS.VIEW', 'EXPENSE_PROPOSALS.ADD', 'EXPENSE_PROPOSALS.EDIT', 'EXPENSE_PROPOSALS.DELETE'
  ]::TEXT[]) AS code
  WHERE code <> ALL ("permissions")
),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'role_staff';
