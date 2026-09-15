-- Quán chi của phiếu đề xuất chi: từ chữ tự do sang tài khoản quán.

-- AlterTable
ALTER TABLE "ExpenseProposal" ADD COLUMN "shopId" TEXT;

-- Phiếu cũ: gán quán nếu tên đã gõ trùng tên đúng một tài khoản quán (không phân biệt hoa thường).
-- Không khớp hoặc khớp nhiều hơn một thì để null — giao diện hiện "-", không đoán bừa.
UPDATE "ExpenseProposal" ep
SET "shopId" = matched."id"
FROM (
  SELECT lower(trim(u."name")) AS key, min(u."id") AS id
  FROM "User" u
  JOIN "Role" r ON r."id" = u."roleId"
  WHERE r."isShop"
  GROUP BY lower(trim(u."name"))
  HAVING count(*) = 1
) matched
WHERE lower(trim(ep."shopName")) = matched.key;

-- AlterTable
ALTER TABLE "ExpenseProposal" DROP COLUMN "shopName";

-- CreateIndex
CREATE INDEX "ExpenseProposal_shopId_idx" ON "ExpenseProposal"("shopId");

-- AddForeignKey
ALTER TABLE "ExpenseProposal" ADD CONSTRAINT "ExpenseProposal_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
