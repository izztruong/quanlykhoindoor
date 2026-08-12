-- Lịch hạn nộp mặc định. Đặt trong migration chứ không phải prisma/seed.ts vì Render chỉ chạy
-- `prisma migrate deploy` lúc khởi động, không chạy seed — để trong seed thì production sẽ không
-- có dòng nào và mọi đơn/phiếu đều thành "chưa đánh giá".
--
-- weekday theo ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. Ở đây 2 = Thứ 3.
-- ON CONFLICT DO NOTHING để chạy lại không ghi đè giá trị admin đã tự chỉnh.
INSERT INTO "Deadline" ("id", "kind", "weekday", "graceDays", "hour", "minute", "updatedAt") VALUES
  -- Đơn hàng: 22:00 mỗi ngày, đo theo chính ngày tạo đơn.
  ('deadline_sales_order',         'SALES_ORDER',         NULL, 0, 22, 0, NOW()),
  -- Phiếu kiểm tuần: 12:00 Thứ 3 của tuần chứa ngày kiểm.
  ('deadline_stock_check_weekly',  'STOCK_CHECK_WEEKLY',     2, 0, 12, 0, NOW()),
  -- Phiếu kiểm tháng: 12:00 ngày cuối tháng + 1 ngày, tức mùng 1 tháng sau.
  ('deadline_stock_check_monthly', 'STOCK_CHECK_MONTHLY', NULL, 1, 12, 0, NOW())
ON CONFLICT ("kind") DO NOTHING;
