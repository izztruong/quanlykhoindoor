-- Kho của quán. Nối hai trục định danh địa điểm: phiếu nhập/xuất kho neo theo `warehouseId`, còn
-- phiếu kiểm quán / huỷ / điều chuyển / POS / Check Cost neo theo tài khoản quán. Check Cost sẽ lấy
-- cột "Nhận trong kỳ" từ phiếu nhập của kho có `shopUserId` = quán của phiếu.
--
-- Nullable: kho không thuộc quán nào vẫn hợp lệ (kho tổng). UNIQUE: một quán đúng một kho.
-- ON DELETE SET NULL chứ không CASCADE — xoá tài khoản quán không được kéo theo cả kho và lịch sử
-- phiếu nhập của nó.

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "shopUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_shopUserId_key" ON "Warehouse"("shopUserId");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_shopUserId_fkey" FOREIGN KEY ("shopUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
