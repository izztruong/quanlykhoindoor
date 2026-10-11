-- Chuyển "SL nhận" trên dòng đơn hàng thành phiếu nhập kho của kho quán.
--
-- Check Cost sắp đổi nguồn cột "Nhận trong kỳ" từ SalesOrderItem.receivedQuantity sang phiếu nhập;
-- không chuyển dữ liệu cũ thì tạo lại phiếu Check Cost cho kỳ trước sẽ ra cột đó bằng 0.
--
-- Gom theo (quán, ĐÚNG mốc receivedAt kể cả GIỜ). Cắt về ngày trần 00:00 sẽ đẩy hàng nhận cùng ngày
-- với phiếu kiểm đầu kỳ ra ngoài kỳ — mốc kỳ (StockCheck.checkedAt) có cả giờ. Đúng cái bẫy ghi ở
-- comment của SalesOrderItem.receivedAt.
--
-- Chỉ đơn do tài khoản có vai trò "Là quán" tạo: nguồn cũ lọc salesOrder.createdById = costCheck.userId
-- nên đơn do admin gõ hộ (dữ liệu thật có 4 đơn, trong đó 1 đơn 134 dòng) VỐN CHƯA BAO GIỜ được tính.
-- Giữ nguyên hành vi đó, đừng "sửa" ở đây — làm vậy là đổi số của kỳ cũ.
--
-- Bỏ dòng receivedQuantity <= 0: đã kiểm, dữ liệu thật có đúng 84 dòng bằng 0 và KHÔNG có dòng âm,
-- nên bỏ không đổi tổng; giữ lại thì sinh dòng phiếu nhập SL 0 vô nghĩa (API cũng đòi quantity > 0).

CREATE TEMP TABLE _mig_line AS
SELECT w.id                  AS warehouse_id,
       s."createdById"       AS shop_id,
       i."receivedAt"        AS received_at,
       i."productId"         AS product_id,
       i."receivedQuantity"  AS qty,
       -- Giá vốn hiện hành của hàng hoá, KHÔNG lấy từ phiếu xuất cũ: ở đó chỉ 5/1103 dòng có giá > 0.
       -- Đây cũng đúng là giá mà báo cáo Check Cost dùng để quy ra tiền, nên không đổi số.
       COALESCE(p."costPrice", 0) AS cost_price
FROM "SalesOrderItem" i
JOIN "SalesOrder" s ON s.id = i."salesOrderId"
JOIN "User" u       ON u.id = s."createdById"
JOIN "Role" r       ON r.id = u."roleId" AND r."isShop" = true
JOIN "Warehouse" w  ON w."shopUserId" = s."createdById"
JOIN "Product" p    ON p.id = i."productId"
WHERE i."receivedAt" IS NOT NULL
  AND COALESCE(i."receivedQuantity", 0) > 0
  AND s."status" <> 'CANCELLED';

CREATE TEMP TABLE _mig_slip AS
SELECT row_number() OVER (ORDER BY shop_id, received_at) AS rn,
       warehouse_id, shop_id, received_at
FROM _mig_line
GROUP BY warehouse_id, shop_id, received_at;

-- code: generateCode("PN") là TypeScript, SQL không gọi được. Dãy PN + YYMMDD + 9 số thứ tự vừa duy
-- nhất trong phiếu mới, vừa không thể trùng phiếu đang có (phiếu thật dùng 9 số ngẫu nhiên lớn).
-- id đặt tay để chạy lại không sinh phiếu trùng.
INSERT INTO "StockImport"
  ("id", "code", "type", "transactionAt", "form", "status", "note", "warehouseId", "supplierId", "createdById", "createdAt")
SELECT 'si_mig_' || lpad(g.rn::text, 4, '0'),
       'PN' || to_char(g.received_at, 'YYMMDD') || lpad(g.rn::text, 9, '0'),
       'PURCHASE', g.received_at, 'CASH', 'COMPLETED',
       'Sinh từ SL nhận trên đơn hàng (migration)',
       g.warehouse_id,
       -- NCC để trống: NCC của phiếu nhập là MỘT nhà cung cấp trên đầu phiếu (một chuyến giao), còn
       -- dữ liệu cũ chỉ có NCC theo DÒNG phiếu xuất và chỉ 4/1103 dòng khai — suy ra là suy sai.
       NULL,
       g.shop_id, NOW()
FROM _mig_slip g
WHERE NOT EXISTS (SELECT 1 FROM "StockImport" si WHERE si.id = 'si_mig_' || lpad(g.rn::text, 4, '0'));

-- Một dòng nguồn = một dòng phiếu, KHÔNG gộp theo hàng hoá: dữ liệu thật có cặp
-- (quán, receivedAt, hàng hoá) trùng nhau, mà StockImportItem không có @@unique(stockImportId,
-- productId) nên để nguyên vẫn hợp lệ, và groupBy("productId") của Check Cost cộng ra đúng con số.
INSERT INTO "StockImportItem" ("id", "stockImportId", "productId", "quantity", "costPrice", "costAmount", "note")
SELECT gen_random_uuid()::text,
       'si_mig_' || lpad(g.rn::text, 4, '0'),
       l.product_id, l.qty, l.cost_price, l.qty * l.cost_price, NULL
FROM _mig_line l
JOIN _mig_slip g ON g.shop_id = l.shop_id AND g.received_at = l.received_at
WHERE NOT EXISTS (
  SELECT 1 FROM "StockImportItem" it WHERE it."stockImportId" = 'si_mig_' || lpad(g.rn::text, 4, '0')
);

-- Chốt phòng vệ: tổng SL phải khớp giữa nguồn cũ và phiếu vừa sinh. Lệch là dừng ngay, vì sau đây
-- Check Cost sẽ đọc phiếu nhập và sai số sẽ im lặng.
DO $$
DECLARE src numeric; dst numeric;
BEGIN
  SELECT COALESCE(SUM(qty), 0) INTO src FROM _mig_line;
  SELECT COALESCE(SUM(it."quantity"), 0) INTO dst
  FROM "StockImportItem" it WHERE it."stockImportId" LIKE 'si\_mig\_%';
  IF src <> dst THEN
    RAISE EXCEPTION 'Tổng SL lệch khi chuyển sang phiếu nhập: nguồn % vs phiếu %', src, dst;
  END IF;
END $$;

DROP TABLE _mig_line, _mig_slip;
