-- Công thức riêng theo quán: `shopUserId` NULL = phiên bản CHUNG, có giá trị = bản riêng của quán đó.
--
-- KHÔNG chèn và KHÔNG sửa một dòng dữ liệu nào: mọi version đang có giữ đúng nghĩa cũ (NULL = chung),
-- nên trước khi ai khai công thức riêng thì mọi phép tính ra kết quả y như trước.

-- DropIndex
DROP INDEX "FinishedGoodRecipeVersion_finishedGoodItemId_effectiveFrom_key";

-- AlterTable
ALTER TABLE "FinishedGoodRecipeVersion" ADD COLUMN     "shopUserId" TEXT;

-- CreateIndex
CREATE INDEX "FinishedGoodRecipeVersion_shopUserId_idx" ON "FinishedGoodRecipeVersion"("shopUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodRecipeVersion_finishedGoodItemId_shopUserId_eff_key" ON "FinishedGoodRecipeVersion"("finishedGoodItemId", "shopUserId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "FinishedGoodRecipeVersion" ADD CONSTRAINT "FinishedGoodRecipeVersion_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nửa còn lại của ràng buộc trên, cho nhánh shopUserId IS NULL.
--
-- PostgreSQL coi NULL là KHÁC NHAU trong UNIQUE, nên index unique ba cột ở trên KHÔNG chặn được hai
-- version CHUNG cùng ngày cho một món — đúng cái "version rác" mà chú thích trên `effectiveFrom`
-- dựng ràng buộc cũ để chặn. Prisma 7 không khai báo được index một phần, nên phải viết tay ở đây.
--
-- HỆ QUẢ PHẢI BIẾT: schema.prisma không diễn tả được index này. Đã đo trên Prisma 7.8 là
-- `migrate dev --create-only` KHÔNG đòi xoá nó, nhưng Prisma cũng không biết nó tồn tại — mỗi lần
-- sinh migration vẫn phải soi xem có câu DROP nào cho nó không.
CREATE UNIQUE INDEX "FinishedGoodRecipeVersion_shared_effective_key"
  ON "FinishedGoodRecipeVersion" ("finishedGoodItemId", "effectiveFrom")
  WHERE "shopUserId" IS NULL;
