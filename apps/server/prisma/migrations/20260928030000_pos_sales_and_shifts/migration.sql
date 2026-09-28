-- Nhập doanh số POS: ánh xạ tên món, khung giờ 3 ca, và doanh số ở mức GIỜ.
--
-- Lưu theo GIỜ chứ không theo ca: ca chỉ là cấu hình, nên đổi mốc chia ca về sau là TÍNH LẠI chứ
-- không phải nhập lại. Lưu sẵn theo ca thì một lần đổi khung giờ là mất cả kho lịch sử.
--
-- PosSaleHour.source phân biệt số đo được tới mức giờ (EXCEL) với số gõ tay ở mức ca (MANUAL) — không
-- có cột đó thì màn chi tiết theo giờ hiện một cột dựng đứng ở giữa ca mà không ai biết vì sao.
--
-- Phần cuối CHÈN DỮ LIỆU (3 ca mặc định) nên migration này phải thử trên database trắng trước khi push.

-- CreateEnum
CREATE TYPE "ShiftCode" AS ENUM ('CA1', 'CA2', 'CA3');

-- CreateEnum
CREATE TYPE "PosSaleSource" AS ENUM ('EXCEL', 'MANUAL');

-- CreateTable
CREATE TABLE "ShiftDefinition" (
    "id" TEXT NOT NULL,
    "code" "ShiftCode" NOT NULL,
    "name" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSaleHour" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soldOn" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "source" "PosSaleSource" NOT NULL DEFAULT 'EXCEL',

    CONSTRAINT "PosSaleHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosItemMapping" (
    "id" TEXT NOT NULL,
    "posName" TEXT NOT NULL,
    "posNameRaw" TEXT NOT NULL,
    "finishedGoodItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftDefinition_code_key" ON "ShiftDefinition"("code");

-- CreateIndex
CREATE INDEX "PosSaleHour_userId_soldOn_idx" ON "PosSaleHour"("userId", "soldOn");

-- CreateIndex
CREATE INDEX "PosSaleHour_finishedGoodItemId_idx" ON "PosSaleHour"("finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PosSaleHour_userId_soldOn_hour_finishedGoodItemId_key" ON "PosSaleHour"("userId", "soldOn", "hour", "finishedGoodItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PosItemMapping_posName_key" ON "PosItemMapping"("posName");

-- CreateIndex
CREATE INDEX "PosItemMapping_finishedGoodItemId_idx" ON "PosItemMapping"("finishedGoodItemId");

-- AddForeignKey
ALTER TABLE "PosSaleHour" ADD CONSTRAINT "PosSaleHour_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosSaleHour" ADD CONSTRAINT "PosSaleHour_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosItemMapping" ADD CONSTRAINT "PosItemMapping_finishedGoodItemId_fkey" FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Khung giờ 3 ca mặc định. Đặt trong MIGRATION chứ không phải prisma/seed.ts vì Render chỉ chạy
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
