-- Menu của quán: món/đồ thành phẩm này có ở quán nào.
--
-- KHÔNG CÓ DÒNG NÀO cho một món = món đó hiện ở MỌI quán. Nhờ quy ước đó migration này KHÔNG chèn
-- và KHÔNG sửa một dòng dữ liệu nào: mọi món đang có đều "chưa gán", nên mọi danh sách và mọi phép
-- chặn ghi hành xử y như trước khi áp migration. Chỉ khi admin tích ô đầu tiên mới có gì đổi.
--
-- Cascade cả hai phía: đây là bảng GÁN, không phải bảng lịch sử. Hệ quả phải biết — xoá một tài
-- khoản quán dọn luôn dòng gán của quán đó, nên món chỉ gán cho quán ấy sẽ thành "mọi quán".

-- CreateTable
CREATE TABLE "FinishedGoodItemShop" (
    "id" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "shopUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedGoodItemShop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinishedGoodItemShop_shopUserId_idx" ON "FinishedGoodItemShop"("shopUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodItemShop_finishedGoodItemId_shopUserId_key" ON "FinishedGoodItemShop"("finishedGoodItemId", "shopUserId");

-- AddForeignKey
ALTER TABLE "FinishedGoodItemShop" ADD CONSTRAINT "FinishedGoodItemShop_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodItemShop" ADD CONSTRAINT "FinishedGoodItemShop_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
