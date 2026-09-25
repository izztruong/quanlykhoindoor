-- Khung giờ 3 ca mặc định. Đặt trong migration chứ không phải prisma/seed.ts vì Render chỉ chạy
-- `prisma migrate deploy` lúc khởi động, không chạy seed — để trong seed thì production sẽ không có
-- dòng nào, và endpoint cắt doanh số theo ca trả 409 "chưa khai khung giờ ca".
--
-- endHour < startHour nghĩa là ca chạy qua nửa đêm: ca tối 22:00 → 02:00 thuộc ngày kinh doanh hôm
-- trước. Giờ lưu bằng hai cột số nguyên chứ không phải DateTime, cùng lý do đã ghi ở bảng Deadline.
--
-- ON CONFLICT DO NOTHING để chạy lại không ghi đè khung giờ admin đã tự chỉnh.
INSERT INTO "ShiftDefinition" ("id", "code", "name", "startHour", "startMinute", "endHour", "endMinute", "updatedAt") VALUES
  ('shift_ca1', 'CA1', 'Ca sáng',  6, 0, 14, 0, NOW()),
  ('shift_ca2', 'CA2', 'Ca chiều', 14, 0, 22, 0, NOW()),
  ('shift_ca3', 'CA3', 'Ca tối',   22, 0,  2, 0, NOW())
ON CONFLICT ("code") DO NOTHING;
