-- Nhịp gọi đồ chuyển từ LỊCH TUẦN sang ĐIỀU KIỆN THANH TOÁN.
--
-- `OrderScheduleDay` (lịch gọi chung T5 + CN, seed ở 20260925160509) bị xoá hẳn thay vì để lại: giả định
-- "cả chuỗi gọi theo một lịch tuần" không khớp dữ liệu thật — đơn được tạo cả 7 thứ, và tần suất nhận
-- hàng tách hai bậc theo nhóm hàng (hoa quả gần như hằng ngày, nhóm khác 5–12 ngày/57). Để lại bảng chết
-- thì người đọc schema sau này sẽ tưởng nó còn tác dụng.
--
-- Hai dòng dữ liệu bị mất (weekday 4 và 7) không cần giữ: thông tin tương đương giờ nằm ở
-- `ProductSupplierPrice.hasCredit` + `Product.orderCadence`, khai theo từng hàng hoá chứ không chung.

-- CreateEnum
CREATE TYPE "OrderCadence" AS ENUM ('CREDIT_TWICE_MONTHLY', 'BY_COVER_DAYS', 'CENTRAL');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "coverDays" INTEGER,
ADD COLUMN     "orderCadence" "OrderCadence";

-- AlterTable
ALTER TABLE "ProductSupplierPrice" ADD COLUMN     "hasCredit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "freeShipThreshold" DECIMAL(18,2);

-- DropTable
DROP TABLE "OrderScheduleDay";
