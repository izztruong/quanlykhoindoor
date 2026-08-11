-- Gỡ chức năng thông báo Zalo. Hai migration thêm cột trước đó được giữ nguyên thay vì xoá khỏi
-- lịch sử: chúng đã chạy trên DB staging, xoá đi sẽ khiến lịch sử migration lệch với thực tế.
-- Dữ liệu mất ở đây chỉ là chat ID đã gán và mốc thời gian đã gửi thông báo — đều vô nghĩa khi
-- không còn chức năng.
ALTER TABLE "SalesOrder" DROP COLUMN "notifiedAt";
ALTER TABLE "SalesOrder" DROP COLUMN "pendingNotifiedAt";
ALTER TABLE "User" DROP COLUMN "zaloChatId";
