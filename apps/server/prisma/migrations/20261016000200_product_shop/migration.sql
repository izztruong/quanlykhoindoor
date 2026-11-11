-- Hàng hoá nào có ở quán nào — song sinh với FinishedGoodItemShop.
--
-- KHÔNG CÓ DÒNG NÀO cho một hàng hoá = hàng đó hiện ở MỌI quán, nên migration này KHÔNG chèn và
-- KHÔNG sửa một dòng dữ liệu nào: trước khi admin tích ô đầu tiên, mọi thứ hành xử y như cũ.

-- CreateTable
CREATE TABLE "ProductShop" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductShop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductShop_shopUserId_idx" ON "ProductShop"("shopUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductShop_productId_shopUserId_key" ON "ProductShop"("productId", "shopUserId");

-- AddForeignKey
ALTER TABLE "ProductShop" ADD CONSTRAINT "ProductShop_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShop" ADD CONSTRAINT "ProductShop_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
