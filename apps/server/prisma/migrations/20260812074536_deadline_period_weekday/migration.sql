-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "periodWeekday" INTEGER;

-- Trước khi có cột này, kỳ được suy ra từ tuần lịch cố định bắt đầu Thứ 2. Điền 1 (Thứ 2) cho
-- dòng đang có để hành vi không đổi một chút nào sau khi nâng cấp — hạn vẫn rơi đúng vào ngày cũ.
UPDATE "Deadline" SET "periodWeekday" = 1 WHERE "kind" = 'STOCK_CHECK_WEEKLY' AND "periodWeekday" IS NULL;
