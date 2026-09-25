-- Ngày gọi đồ mặc định: tối Thứ 5 và tối Chủ nhật. Đặt trong migration chứ không phải prisma/seed.ts
-- vì Render chỉ chạy `migrate deploy` lúc khởi động — để trong seed thì production không có dòng nào và
-- phần gợi ý đặt hàng không tính được số ngày cần phủ.
--
-- weekday theo ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. Ở đây 4 = Thứ 5, 7 = Chủ nhật.
-- ON CONFLICT DO NOTHING để chạy lại không ghi đè lịch admin đã tự chỉnh.
INSERT INTO "OrderScheduleDay" ("weekday") VALUES (4), (7)
ON CONFLICT ("weekday") DO NOTHING;
