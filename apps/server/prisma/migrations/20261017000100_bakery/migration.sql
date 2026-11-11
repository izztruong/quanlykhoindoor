-- Tiệm bánh: cờ Role.isBakery + bảng BakerySale ("bánh bán ra").
--
-- KHÔNG chèn và KHÔNG sửa một dòng dữ liệu nào. Cờ mới mặc định false nên mọi vai trò đang có giữ
-- nguyên hành vi; bảng mới rỗng nên không chức năng nào đổi cho tới khi có tài khoản tiệm bánh.

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "isBakery" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BakerySale" (
    "id" TEXT NOT NULL,
    "bakeryUserId" TEXT NOT NULL,
    "shopUserId" TEXT,
    "soldOn" DATE NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BakerySale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BakerySale_bakeryUserId_soldOn_idx" ON "BakerySale"("bakeryUserId", "soldOn");

-- CreateIndex
CREATE INDEX "BakerySale_shopUserId_soldOn_idx" ON "BakerySale"("shopUserId", "soldOn");

-- CreateIndex
CREATE INDEX "BakerySale_finishedGoodItemId_idx" ON "BakerySale"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BakerySale_bakeryUserId_shopUserId_soldOn_finishedGoodItemI_key" ON "BakerySale"("bakeryUserId", "shopUserId", "soldOn", "finishedGoodItemId");

-- AddForeignKey
ALTER TABLE "BakerySale" ADD CONSTRAINT "BakerySale_bakeryUserId_fkey" FOREIGN KEY ("bakeryUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakerySale" ADD CONSTRAINT "BakerySale_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakerySale" ADD CONSTRAINT "BakerySale_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BakerySale" ADD CONSTRAINT "BakerySale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Nửa còn lại của ràng buộc UNIQUE ở trên, cho nhánh "bán ngoài" (shopUserId IS NULL).
--
-- PostgreSQL coi NULL là KHÁC NHAU trong UNIQUE, nên index unique bốn cột ở trên KHÔNG chặn được
-- hai dòng bán ngoài cùng (ngày, bánh). Prisma 7 không khai báo được index một phần, nên viết tay.
-- Đây là chỗ THỨ BA trong repo dùng thủ pháp này — xem mục "Index viết tay" trong CLAUDE.md.
CREATE UNIQUE INDEX "BakerySale_external_key"
  ON "BakerySale" ("bakeryUserId", "soldOn", "finishedGoodItemId")
  WHERE "shopUserId" IS NULL;
