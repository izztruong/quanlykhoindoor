-- Tạo một kho cho mỗi tài khoản quán (Role.isShop) chưa có kho.
--
-- Quán nào cũng phải có kho, kể cả quán chưa từng nhập gì: Check Cost lấy cột "Nhận trong kỳ" từ
-- phiếu nhập của kho quán, thiếu kho là migration sinh phiếu nhập (20261012000400) âm thầm bỏ cả
-- quán đó — INNER JOIN loại dòng chứ không báo lỗi.
--
-- `id` đặt tay theo mẫu 20260812124250_seed_default_deadlines: chạy lại không sinh kho trùng.
-- Tiền tố mã là KHOQ để không đụng KHO01 (kho tổng cũ).

WITH shops AS (
  SELECT u.id, u.name, row_number() OVER (ORDER BY u."createdAt", u.id) AS rn
  FROM "User" u
  JOIN "Role" r ON r.id = u."roleId"
  WHERE r."isShop" = true
)
INSERT INTO "Warehouse" ("id", "code", "name", "address", "createdAt", "shopUserId")
SELECT 'wh_shop_' || s.id,
       'KHOQ' || lpad(s.rn::text, 2, '0'),
       'Kho ' || s.name,
       NULL,
       NOW(),
       s.id
FROM shops s
WHERE NOT EXISTS (SELECT 1 FROM "Warehouse" w WHERE w."shopUserId" = s.id)
ON CONFLICT ("code") DO NOTHING;

-- Chốt phòng vệ. Dừng ngay còn hơn để migration sau ra số thiếu mà không ai biết.
DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM "User" u
  JOIN "Role" r ON r.id = u."roleId"
  WHERE r."isShop" = true
    AND NOT EXISTS (SELECT 1 FROM "Warehouse" w WHERE w."shopUserId" = u.id);
  IF missing > 0 THEN
    RAISE EXCEPTION 'Còn % tài khoản quán chưa có kho — dừng migration', missing;
  END IF;
END $$;
