-- Phiếu đề xuất chi: tạm ứng nhiều lần, duyệt bổ sung bảng hạng mục dự kiến, Hoàn thành có hạng mục
-- thực chi + ngày nộp hoá đơn + ảnh chứng từ; tách quyền PAY thành ADVANCE (Tạm ứng) + COMPLETE (Hoàn thành).

-- AlterEnum
ALTER TYPE "ExpenseProposalStatus" ADD VALUE 'REAPPROVAL';

-- AlterTable: thêm cột mới trước, xoá cột cũ ở cuối — dữ liệu tạm ứng cũ phải chuyển sang bảng mới đã.
ALTER TABLE "ExpenseProposal"
ADD COLUMN     "invoiceDate" DATE,
ADD COLUMN     "pendingItems" JSONB,
ADD COLUMN     "pendingTotal" DECIMAL(18,2),
ADD COLUMN     "revisionDecidedAt" TIMESTAMP(3),
ADD COLUMN     "revisionDecidedById" TEXT,
ADD COLUMN     "revisionRejectReason" TEXT,
ADD COLUMN     "spentAmount" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "ExpenseProposalAdvance" (
    "id" TEXT NOT NULL,
    "expenseProposalId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseProposalAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseProposalSpentItem" (
    "id" TEXT NOT NULL,
    "expenseProposalId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ExpenseProposalSpentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseProposalImage" (
    "id" TEXT NOT NULL,
    "expenseProposalId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseProposalImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseProposalAdvance_expenseProposalId_createdAt_idx" ON "ExpenseProposalAdvance"("expenseProposalId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseProposalSpentItem_expenseProposalId_sortOrder_idx" ON "ExpenseProposalSpentItem"("expenseProposalId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseProposalImage_objectKey_key" ON "ExpenseProposalImage"("objectKey");

-- CreateIndex
CREATE INDEX "ExpenseProposalImage_expenseProposalId_idx" ON "ExpenseProposalImage"("expenseProposalId");

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_revisionDecidedById_fkey" FOREIGN KEY ("revisionDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposalAdvance" ADD CONSTRAINT "ExpenseProposalAdvance_expenseProposalId_fkey" FOREIGN KEY ("expenseProposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposalAdvance" ADD CONSTRAINT "ExpenseProposalAdvance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposalSpentItem" ADD CONSTRAINT "ExpenseProposalSpentItem_expenseProposalId_fkey" FOREIGN KEY ("expenseProposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseProposalImage" ADD CONSTRAINT "ExpenseProposalImage_expenseProposalId_fkey" FOREIGN KEY ("expenseProposalId") REFERENCES "ExpenseProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chuyển lần tạm ứng duy nhất của phiếu cũ sang bảng mới: phiếu đã bấm "Đã tạm ứng" (advancedAt có
-- giá trị) thành một dòng tạm ứng, số tiền = advanceAmount đã lưu, giữ đúng người và giờ bấm.
INSERT INTO "ExpenseProposalAdvance" ("id", "expenseProposalId", "amount", "createdById", "createdAt")
SELECT gen_random_uuid()::text, "id", COALESCE("advanceAmount", 0), "advancedById", "advancedAt"
FROM "ExpenseProposal"
WHERE "advancedAt" IS NOT NULL;

-- DropForeignKey + bỏ cột cũ: % tạm ứng không dùng nữa (nhập thẳng số tiền), người/giờ tạm ứng đã
-- nằm trong ExpenseProposalAdvance.
ALTER TABLE "ExpenseProposal" DROP CONSTRAINT "ExpenseProposal_advancedById_fkey";

ALTER TABLE "ExpenseProposal" DROP COLUMN "advancePercent",
DROP COLUMN "advancedAt",
DROP COLUMN "advancedById";

-- Tách quyền: ai đang giữ PAY (Tạm ứng / Đã chi) thì nhận cả ADVANCE lẫn COMPLETE, không mất quyền nào.
UPDATE "Role"
SET "permissions" = array_remove("permissions", 'EXPENSE_PROPOSALS.PAY')
      || ARRAY(
        SELECT code FROM unnest(ARRAY['EXPENSE_PROPOSALS.ADVANCE', 'EXPENSE_PROPOSALS.COMPLETE']::TEXT[]) AS code
        WHERE code <> ALL ("permissions")
      ),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE 'EXPENSE_PROPOSALS.PAY' = ANY ("permissions");

-- Vai trò "Quán" tự khai số thực chi cho phiếu mình lập, nên được cấp sẵn quyền Hoàn thành.
UPDATE "Role"
SET "permissions" = "permissions" || ARRAY['EXPENSE_PROPOSALS.COMPLETE']::TEXT[],
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'role_staff' AND NOT ('EXPENSE_PROPOSALS.COMPLETE' = ANY ("permissions"));
