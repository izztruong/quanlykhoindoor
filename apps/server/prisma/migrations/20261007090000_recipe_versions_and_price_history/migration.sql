-- Version hoá công thức (BOM) + lịch sử giá bán đồ thành phẩm.
--
-- VIẾT TAY, không phải bản Prisma sinh ra: đây là rename-kèm-backfill
-- (FinishedGoodRecipeItem.finishedGoodItemId -> versionId) mà Prisma không suy được — nó sẽ
-- drop cột rồi tạo lại, mất sạch 434 dòng công thức.
--
-- Migration này CHÈN DỮ LIỆU nên phải thử `migrate deploy` trên một DATABASE TRẮNG trước khi push:
-- máy dev áp migration theo thứ tự viết ra nên che mất lỗi thứ tự.
--
-- Mốc gốc 2000-01-01 = trước mọi dữ liệu kinh doanh, để phiếu Check Cost cũ nhất vẫn phân giải
-- được ra công thức/giá (phân giải = version mới nhất có effectiveFrom <= mốc cần tra).

-- ---------------------------------------------------------------------------
-- 1) Bảng phiên bản công thức
-- ---------------------------------------------------------------------------
CREATE TABLE "FinishedGoodRecipeVersion" (
    "id" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedGoodRecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinishedGoodRecipeVersion_finishedGoodItemId_effectiveFrom_key"
    ON "FinishedGoodRecipeVersion"("finishedGoodItemId", "effectiveFrom");

ALTER TABLE "FinishedGoodRecipeVersion" ADD CONSTRAINT "FinishedGoodRecipeVersion_finishedGoodItemId_fkey"
    FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinishedGoodRecipeVersion" ADD CONSTRAINT "FinishedGoodRecipeVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Một version gốc cho mỗi món ĐANG CÓ dòng công thức
-- ---------------------------------------------------------------------------
INSERT INTO "FinishedGoodRecipeVersion" ("id", "finishedGoodItemId", "effectiveFrom", "note")
SELECT gen_random_uuid()::text, d."finishedGoodItemId", DATE '2000-01-01',
       'Phiên bản gốc — chuyển từ công thức chưa có lịch sử'
FROM (SELECT DISTINCT "finishedGoodItemId" FROM "FinishedGoodRecipeItem") d;

-- ---------------------------------------------------------------------------
-- 3) Cột versionId: thêm nullable -> backfill -> SET NOT NULL
--    SET NOT NULL chính là chốt an toàn: còn một dòng mồ côi là cả migration rollback,
--    không bao giờ mất dữ liệu nửa vời.
-- ---------------------------------------------------------------------------
ALTER TABLE "FinishedGoodRecipeItem" ADD COLUMN "versionId" TEXT;

UPDATE "FinishedGoodRecipeItem" it
   SET "versionId" = v."id"
  FROM "FinishedGoodRecipeVersion" v
 WHERE v."finishedGoodItemId" = it."finishedGoodItemId"
   AND v."effectiveFrom" = DATE '2000-01-01';

ALTER TABLE "FinishedGoodRecipeItem" ALTER COLUMN "versionId" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) Bỏ đường cũ (dòng trỏ thẳng vào đồ thành phẩm)
-- ---------------------------------------------------------------------------
ALTER TABLE "FinishedGoodRecipeItem" DROP CONSTRAINT "FinishedGoodRecipeItem_finishedGoodItemId_fkey";
DROP INDEX "FinishedGoodRecipeItem_finishedGoodItemId_productId_key";
ALTER TABLE "FinishedGoodRecipeItem" DROP COLUMN "finishedGoodItemId";

-- ---------------------------------------------------------------------------
-- 5) Khoá mới. Không cần index riêng cho versionId — unique dưới đây đã phủ prefix.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "FinishedGoodRecipeItem_versionId_productId_key"
    ON "FinishedGoodRecipeItem"("versionId", "productId");

ALTER TABLE "FinishedGoodRecipeItem" ADD CONSTRAINT "FinishedGoodRecipeItem_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "FinishedGoodRecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6) productId: CASCADE -> RESTRICT.
--    Đây là bảng lịch sử, không được để một lệnh xoá danh mục làm rỗng version cũ. Cascade hiện tại
--    chỉ có tác dụng với hàng hoá "chỉ nằm trong công thức, chưa phát sinh gì" (StockCheckItem,
--    SalesOrderItem... đều đã Restrict sẵn) — đúng ca mà nó xoá im lặng. Ngừng dùng hàng hoá thì
--    đặt Product.active = false. Đổi FK action không đụng một dòng dữ liệu nào.
-- ---------------------------------------------------------------------------
ALTER TABLE "FinishedGoodRecipeItem" DROP CONSTRAINT "FinishedGoodRecipeItem_productId_fkey";
ALTER TABLE "FinishedGoodRecipeItem" ADD CONSTRAINT "FinishedGoodRecipeItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7) Lịch sử giá bán. Gộp vào cùng migration để chỉ deploy một lần.
-- ---------------------------------------------------------------------------
CREATE TABLE "FinishedGoodPrice" (
    "id" TEXT NOT NULL,
    "finishedGoodItemId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "sellingPrice" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinishedGoodPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinishedGoodPrice_finishedGoodItemId_effectiveFrom_key"
    ON "FinishedGoodPrice"("finishedGoodItemId", "effectiveFrom");

ALTER TABLE "FinishedGoodPrice" ADD CONSTRAINT "FinishedGoodPrice_finishedGoodItemId_fkey"
    FOREIGN KEY ("finishedGoodItemId") REFERENCES "FinishedGoodItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinishedGoodPrice" ADD CONSTRAINT "FinishedGoodPrice_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Giá hiện hành thành mốc gốc, để doanh thu của kỳ cũ không về 0.
INSERT INTO "FinishedGoodPrice" ("id", "finishedGoodItemId", "effectiveFrom", "sellingPrice")
SELECT gen_random_uuid()::text, "id", DATE '2000-01-01', "sellingPrice"
FROM "FinishedGoodItem"
WHERE "sellingPrice" IS NOT NULL;
