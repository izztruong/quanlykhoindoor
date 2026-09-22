-- Bỏ trường Loại phiếu (MKT / Vận hành / CSVC) của phiếu đề xuất chi. Người dùng yêu cầu xoá luôn
-- dữ liệu loại phiếu của các phiếu cũ — mất theo cột, không giữ lại ở đâu.

-- DropIndex
DROP INDEX "ExpenseProposal_category_idx";

-- AlterTable
ALTER TABLE "ExpenseProposal" DROP COLUMN "category";

-- DropEnum
DROP TYPE "ExpenseProposalCategory";
