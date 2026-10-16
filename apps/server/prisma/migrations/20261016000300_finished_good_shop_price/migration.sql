-- Giá bán riêng theo quán: `shopUserId` NULL = mốc giá CHUNG, có giá trị = mốc riêng của quán đó.
--
-- KHÔNG chèn và KHÔNG sửa một dòng dữ liệu nào: mọi mốc giá đang có giữ đúng nghĩa cũ (NULL = chung),
-- nên trước khi ai khai giá riêng thì mọi phép tính ra kết quả y như trước.

-- DropIndex
DROP INDEX "FinishedGoodPrice_finishedGoodItemId_effectiveFrom_key";

-- AlterTable
ALTER TABLE "FinishedGoodPrice" ADD COLUMN     "shopUserId" TEXT;

-- CreateIndex
CREATE INDEX "FinishedGoodPrice_shopUserId_idx" ON "FinishedGoodPrice"("shopUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodPrice_finishedGoodItemId_shopUserId_effectiveFr_key" ON "FinishedGoodPrice"("finishedGoodItemId", "shopUserId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "FinishedGoodPrice" ADD CONSTRAINT "FinishedGoodPrice_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nửa còn lại của ràng buộc trên, cho nhánh shopUserId IS NULL.
--
-- PostgreSQL coi NULL là KHÁC NHAU trong UNIQUE, nên index unique ba cột ở trên KHÔNG chặn được hai
-- mốc CHUNG cùng ngày cho một món. Prisma 7 không khai báo được index một phần (cũng không khai được
-- NULLS NOT DISTINCT), nên phải viết tay ở đây.
--
-- HỆ QUẢ PHẢI BIẾT: schema.prisma không diễn tả được index này. Đã đo trên Prisma 7.8 là
-- `migrate dev --create-only` KHÔNG đòi xoá nó, nhưng Prisma cũng không biết nó tồn tại — mỗi lần
-- sinh migration vẫn phải soi xem có câu DROP nào cho nó không.
CREATE UNIQUE INDEX "FinishedGoodPrice_shared_effective_key"
  ON "FinishedGoodPrice" ("finishedGoodItemId", "effectiveFrom")
  WHERE "shopUserId" IS NULL;
