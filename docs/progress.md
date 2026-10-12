# Tiến độ dự án

Cập nhật: 2026-10-12

Ghi **đúng những gì git không tự trả lời được**. Lý do thiết kế đã nằm trong commit message, đừng
chép lại vào đây. Mỗi mục "Đang dở" tối đa 3–4 dòng, và dòng quan trọng nhất luôn là: *đã kiểm thử
trên trình duyệt chưa, đã lên `main` chưa.*

Mục "Còn lại" chỉ gồm việc đã nêu ra rồi chủ động gác lại — không phải lộ trình tự nghĩ ra.

---

## Đã xong

Đang chạy trên `main`, đã bấm thử trên trình duyệt và đã tick quyền trên production. Chi tiết chức
năng xem `nav-config.ts` và `apps/server/src/modules/`.

- **Danh mục** — hàng hoá (có cờ `active`), nhóm, đơn vị, kho, NCC, khách hàng, đồ thành phẩm
- **Kho** — phiếu nhập, xuất, kiểm kê kho, điều chuyển; giá theo từng NCC
- **Order** — danh sách, tạo đơn (cho đặt vượt tồn), Order nhanh, Tổng hợp đặt NCC; luồng Chưa xử lý
  → Hoàn thành/Huỷ với màn "Xử lý đơn" (NCC, giá, SL + ngày nhận từng dòng); ảnh chứng từ theo dòng hàng
- **Kiểm kê quán** — phiếu kiểm (tuần/tháng), phiếu huỷ nguyên liệu (ô tích "Trừ CC" từng dòng), tự trừ vỏ
- **Check Cost** — báo cáo NVL + tổng hợp tài chính, snapshot chốt cứng, huỷ mềm, công thức BOM và giá
  bán theo mốc hiệu lực, SL món đã bán lấy từ POS, cột "% chênh lệch thực", gộp báo cáo theo loại
- **Doanh số POS** — nhập Excel, gõ tay từng dòng, nhập thẳng từ file nhật ký order của POS; Ánh xạ
  món POS; Khung giờ ca
- **Tài chính** — Đề xuất chi (tạm ứng nhiều lần, duyệt bổ sung hạng mục, hoàn thành + chứng từ),
  Chi chốt ca (Loại chi, ảnh R2, cột Đã chi + Ngày lập phiếu), Chi ngoài
- **Kiểm toán** — 5 báo cáo chỉ đọc
- **Đánh dấu nộp muộn** — chấm xanh/đỏ/xám trên đơn hàng và phiếu kiểm, cấu hình hạn ở Quản trị
- **Trang chủ** — đơn chưa xử lý, huỷ hàng 7 ngày, chi phí NVL tháng + biểu đồ tỷ lệ theo năm, lọc theo quán
- **MCP** — `/mcp` chỉ đọc 12 tool + trang Token MCP; connector claude.ai đã nối được trên production
- **App mobile** — 4 tab, màn hình chờ khởi động, thông báo đẩy 7 loại, Check Cost, công thức theo mốc,
  ghi nhớ đăng nhập, icon mới, tên gói `com.indoor.quanlykho`, nhãn LOCAL/STAGING
- **iOS** — ẩn nút Google (Guideline 4.8), tắt iPad, phát hành dạng Unlisted; đã nộp App Store Connect
- **Nền tảng** — JWT cookie có `tokenVersion`, vai trò tuỳ biến + cờ "Là quán", phạm vi dữ liệu theo
  quán ép ở server, đăng nhập Google (web + mobile) + đổi email, rate limit đăng nhập theo IP thật,
  phân trang 20 dòng, chống chèn công thức Excel, trang `/privacy-policy`, nhánh `dev` + chặn build
  sai môi trường

---

## Đang dở

### Tấm trượt trên iOS bị bàn phím che — CHƯA bấm thử trên iPhone, CHƯA lên `staging`
Gõ số tiền ở màn Tạm ứng (phiếu đề xuất chi) trên iPhone thì bàn phím che mất ô nhập lẫn nút xác nhận.
Lỗi ở `ui/Modal` dùng chung chứ không ở màn đó: tấm trượt `position: absolute` trong một `RNModal`
và không có `KeyboardAvoidingView` — iOS không tự thu nhỏ window của Modal. Sửa một chỗ hết **8 tấm
trượt**; hai cái body là `View` trơn (Tạm ứng, Từ chối phiếu) bọc thêm `ScrollView` như 6 cái còn lại.
Thêm thanh **"Xong"** (`InputAccessoryView`, iOS) cho ô số tiền vì bàn phím `numeric` của iOS không có
phím đóng. Thuần JS nên đi OTA được, không đổi fingerprint.
Đã kiểm: typecheck + `npx expo export --platform android` sạch. Còn lại: bấm thử trên iPhone thật —
đặc biệt **chạm nền mờ để đóng** (phép thử cho `pointerEvents="box-none"`), và thử lại trên Android
để chắc không bị đẩy hai lần.

### Cập nhật OTA cho app + shim giữ app 1.0.4 sống — CHƯA build, CHƯA lên `staging`
Dựng `expo-updates`: `updates.url`, `runtimeVersion` policy **fingerprint**, `channel` cho cả 3 profile
EAS, và `npm run update:preview|production` gác nhánh như lệnh build. Nâng `version` lên **1.0.5**.
**OTA chưa cứu được bản đang dùng**: 1.0.4 không có `expo-updates` nên chỉ binary từ 1.0.5 trở đi nhận được.
Vì vậy thêm shim `GET /api/dashboard/unconfirmed-orders` — thiếu nó thì app 1.0.4 **dừng vĩnh viễn ở màn chờ**
(`useAppStartup` chặn vào app cho tới khi ô Trang chủ nạp xong), không chỉ hỏng một ô. Shim ghi một dòng
`console.warn("[legacy] …")` mỗi lần bị gọi: log im vài ngày = không còn máy nào ở 1.0.4 → xoá được.
Đã kiểm: typecheck 3 app, `npx expo export --platform android` sạch, `expo config` nạp đúng, và curl shim
trên `kho_dev_copy` (5 đơn = đúng SQL, lọc theo quán ra 0 = đúng, chỉ shim sinh log còn `recent-imports` không).
Còn lại: deploy server (shim phải lên `main` **cùng đợt** với phần đã dọn), build + gửi duyệt 1.0.5, rồi
theo log để biết khi nào xoá shim. `expo-doctor` báo 3 lỗi **sẵn có** (`newArchEnabled`, thiếu peer
`expo-font`/`react-native-worklets`, 7 package lệch bản patch) — không phải do đợt này, chưa sửa.

### App mobile theo kịp đợt bỏ kho tổng — CHƯA bấm thử trên máy thật, CHƯA lên `staging`
Trước đợt này app vẫn gọi 8 route server đã xoá (phiếu xuất kho, Khách hàng, 5 báo cáo Kiểm toán,
`/product-stock`, `PUT /sales-orders/:id/process`) và vẫn gửi `warehouseId`/`skipStockCheck` khi tạo đơn.
Đã xoá 11 màn + gộp phiếu nhập về một biến thể (NCC bắt buộc, bỏ ô Trạng thái/Khách hàng), đơn hàng còn
DRAFT/CANCELLED kèm nút "Đánh dấu đã xử lý" + ô lọc Đã xử lý, ô Trang chủ đổi sang "Phiếu nhập kho 7 ngày",
danh mục Kho thêm ô **Quán** (kèm `clearable` cho `CatalogScreen` — không có nó thì không gỡ được quán).
Tab **Báo cáo** bỏ hẳn (nhóm Kiểm toán là toàn bộ nội dung của nó) nên app còn **3 tab**.
Đã kiểm: `npm run typecheck` + `npx expo export --platform android` (bundle 5,8 MB, sạch).
Còn lại: bấm thử trên máy thật, và **sửa/xoá phiếu nhập kho + ảnh chứng từ vẫn chỉ có trên web** —
app chỉ xem và tạo.

### Nhập Excel cho phiếu điều chuyển — CHƯA bấm thử trên trình duyệt, CHƯA lên `staging`
File **hai sheet** như phiếu nhập kho, nhưng quán khớp theo **tên** (tài khoản không có cột mã) và **không có
cột SL lẻ** (dữ liệu thật 0/20 dòng dùng tới, mà đó là cột dễ nhập sai đơn vị nhất) — API vẫn nhận `looseQuantity`.
Mã NCC + Giá vốn theo dòng, để trống được; có NCC mà trống giá thì lấy **`exportPrice`**. Một dòng lỗi là
**không ghi gì**. Cảnh báo Check Cost đẩy **hai cặp** mỗi phiếu (quán gửi + quán nhận). `POST /` nay cũng trả
`affectedCostChecks` — trước chỉ `PUT` có.
Kèm theo: `parseNumber` của **cả repo** về **kiểu máy** (`"1.5"` là 1.5, không còn là 15; `"8.000.000"` và
`"1.234,5"` trước đây đoán im lặng thì giờ báo lỗi đúng dòng) — chỉ ô **chữ** bị ảnh hưởng, đã thêm dòng nói
rõ quy ước vào **cả 4 modal nhập**; `writeWorkbook` sang `lib/excelExport.ts`, `matchShopByName` sang
`lib/excelParse.ts`.
Đã kiểm: typecheck 2 app, lint web **0 lỗi/3 cảnh báo**, build web; **12 ca curl** trên `kho_dev_copy` (3 phiếu/
6 dòng ghi đúng, cảnh báo gồm Check Cost của **cả hai quán**, gửi lại ra `created: 0` + duplicates rồi
`confirmDuplicates` thì ghi, gửi = nhận / tài khoản không phải quán / NCC chưa có giá xuất đều 400 **và không
ghi gì**, 201 phiếu bị chặn, **200 phiếu chạy 403 ms**, SL lẻ qua bulk trừ vỏ ra đúng số của `POST /`); và 21 ca
script `tsx` tạm đọc lại 3 file `.xlsx` vừa sinh rồi xoá script. Dữ liệu thử đã dọn.
Còn lại: bấm thử trên trình duyệt (đã sinh sẵn 3 file: hợp lệ / sai tiêu đề / nhiều lỗi). **Chưa làm Xuất Excel**:
file bỏ cột SL lẻ, và web trừ vỏ lần hai khi mở phiếu ra sửa.

### Nhập/xuất Excel cho phiếu nhập kho, một file nhiều phiếu — CHƯA thử chạy thật, CHƯA lên `staging`
File **hai sheet**: "Phiếu" (có *Mã phiếu tạm*) + "Dòng hàng" trỏ về mã tạm đó; định danh bằng mã kho / mã
NCC / mã hàng hoá nên file xuất ra nhập lại được. Một dòng lỗi là **không ghi gì**, báo hết lỗi theo dòng.
Giá vốn để trống thì lấy giá nhập của NCC. Phiếu trùng (kho, NCC, thời gian) thì trả `created: 0` kèm danh
sách để người dùng bấm "Vẫn nhập" (khuôn 200 + danh sách của `posSales`, vì `HttpError` chỉ chở một câu).
`POST /bulk-import` gộp mọi phép kiểm về **6 query** thay vì 4×N, ghi bằng 3 statement trong một
`$transaction` timeout 30s (`createMany` không nhận nested create nên pre-generate mã rồi đọc lại id).
Thêm `findCostChecksUsingPeriodRecords` gom lô — 200 mốc trước đây là 200 query.
Đã kiểm: typecheck 2 app, lint web 3 cảnh báo, build web; 54 ca script `tsx` tạm (26 ca `parseDateTime`,
23 ca ghi/đọc workbook, 5 ca vòng xuất→nhập khép kín) rồi xoá; và **12 ca curl**: 3 phiếu/4 dòng ghi đúng
`costAmount`, gửi lại ra `created: 0` + 3 duplicates, `confirmDuplicates` thì ghi, thiếu NCC/kho sai/hàng
chưa có giá đều 400 **và không ghi gì**, câu lỗi nêu đúng tên hàng + NCC, quán ghi vào kho quán khác 400,
một phiếu hợp lệ lẫn một phiếu sai cũng không ghi gì, 201 phiếu bị chặn, **200 phiếu chạy 335 ms**.
Còn lại: bấm thử trên trình duyệt (đã sinh sẵn 3 file `.xlsx`: hợp lệ / sai tiêu đề / nhiều lỗi).
Vết sẵn có chưa sửa: phần **xuất theo bộ lọc** đi qua `GET /stock-imports` nên chịu lệch 7 tiếng của
`parseDateRange` (`setHours` theo giờ máy chủ, Render chạy UTC) — không phải lỗi mới của Excel.

### Dọn phần kho cũ + ô Trang chủ mới (C5, C6) — CHƯA thử trên trình duyệt, CHƯA lên `staging`
Xoá: phiếu xuất kho, phiếu kiểm kê kho, danh mục Khách hàng, `/product-stock`, **cả nhóm Kiểm toán (5 trang)**
và 4 mã quyền tương ứng. `getPurchaseSummary` tách sang module `purchaseSummary` (giữ nguyên đường
`/api/reports/purchase-summary`) rồi xoá sạch module `reports`; `modules/stock` đổi tên thành `modules/stockImports`.
Trang chủ: ô "Đơn chưa xử lý" → **"Phiếu nhập kho 7 ngày"** (đơn giờ không có trạng thái nên đếm đơn chưa huỷ
sẽ tăng mãi mà vô nghĩa).
**Hai phát hiện khi chạy migration M6 trên bản copy** — đây đúng là thứ phép thử đó tồn tại để bắt:
1. `DELETE` kho `KHO01` vô điều kiện làm **cả migration vỡ** vì còn 1 phiếu nhập cũ trỏ vào. Đã đổi thành
   xoá có điều kiện + đổi tên thành "Kho tổng (cũ)", **không** xoá phiếu của người dùng trong migration.
2. **Prisma KHÔNG rollback migration lỗi**: các `DROP TABLE` đã commit, chỉ câu cuối vỡ, để DB nửa vời.
   Nghĩa là migration lỗi trên production sẽ để lại trạng thái dở — phải sửa tay rồi `migrate resolve`.
Đã kiểm: `migrate deploy` trên **DB trắng tạo lại từ đầu** (cả 6 migration), typecheck 2 app, lint web về
đúng mốc **3 cảnh báo**, `npm run build` web sạch, và 14 ca curl: 8 endpoint đã xoá trả 404, 6 endpoint còn
lại 200, ô Trang chủ trả số.

### Phiếu nhập kho thành đường ghi chính: sửa/xoá + ảnh chứng từ + phạm vi theo kho (C4) — CHƯA thử trên trình duyệt, CHƯA lên `staging`
Thêm `STOCK_IMPORTS.EDIT/DELETE`, 3 route ảnh (tối đa 5 ảnh/phiếu, prefix R2 `stock-imports/`), trang chi tiết
+ trang sửa bên web (**web trước đây không có trang chi tiết phiếu nhập**). Form: NCC bắt buộc, bỏ ô Khách hàng,
bỏ ô Trạng thái (luôn COMPLETED — phiếu nháp sẽ không vào Check Cost mà chẳng có dấu hiệu gì), thêm ghi chú
từng dòng. `StockImportType` còn PURCHASE/OTHER: bỏ TRANSFER_IN vì Check Cost đã cộng điều chuyển ở cột riêng.
**Phạm vi lọc theo `warehouse.shopUserId`, không theo người tạo** — nhờ vậy admin gõ hộ thì quán vẫn thấy
phiếu của kho mình (vết đang có ở Chi ngoài), và vai trò quán không cần `DATA.SCOPE_ALL`.
Đã kiểm: `migrate deploy` trên **DB trắng tạo lại từ đầu** (cả 5 migration chạy đúng thứ tự tên như production)
+ `kho_dev_copy`; typecheck 2 app; 12 ca schema (6 ảnh, sai định dạng, thiếu NCC, SL 0, `status` bị loại khỏi
payload); và curl: 4 động từ, đổi kho 400, sửa mốc qua kỳ khác vẫn cảnh báo phiếu **kỳ cũ**, quán gõ vào kho
quán khác 404, quán thấy đúng phiếu kho mình **kể cả phiếu admin gõ hộ**, xoá kho đang thuộc quán 409.
Chưa kiểm được: vòng ảnh R2 thật (`dev:copy` cố ý làm rỗng biến R2 để không xoá file production) — đường 503
đã kiểm. Lint web tạm **4 cảnh báo** thay vì 3: cảnh báo thứ 4 là `incompatible-library` của react-hook-form
trong form mới, sẽ về 3 khi C5b xoá form phiếu xuất.

### Bỏ bước xử lý đơn, đơn hàng chỉ còn đề xuất + ô tích "Đã xử lý" (C3) — CHƯA thử trên trình duyệt, CHƯA lên `staging`
Xoá `PUT /:id/process`, màn Xử lý đơn, ảnh chứng từ theo dòng đơn, 4 cột SL nhận, `SalesOrder.warehouseId`
(kéo theo ô "Kho xuất" ở form đặt đơn và trang in). Trạng thái đơn còn DRAFT (nhãn "Đã đặt") / CANCELLED.
`completedAt` **đổi tên** thành `processedAt` chứ không xoá → 185 đơn cũ giữ nguyên mốc, tick sẵn sau migration.
MCP `order_lines` viết lại đọc phiếu nhập kho (tên tool giữ nguyên vì token lưu theo tên); `list_sales_orders`
bỏ `exportLines`/SL nhận, thêm lọc `processed`.
Một lỗi tự tìm ra khi thử: bỏ tích rồi tick lại **bắn thông báo lần hai** vì `firstTick` so `processedAt`
(cột vừa bị xoá). Dấu "đã báo" chuyển sang `processedById`, nên bỏ tích cố ý không xoá cột đó.
Đã kiểm: `migrate deploy` DB trắng + `kho_dev_copy` (185 đơn tick sẵn, enum còn 2 giá trị, bảng ảnh đã xoá),
typecheck + lint web (0 lỗi/3 cảnh báo), và curl: route cũ 404, payload hết `stockExport`, tick/bỏ tích 5 lượt
ra **đúng 1 thông báo**, đơn đã huỷ 409, thiếu APPROVE 403, có APPROVE mà thiếu phạm vi 404, lọc
processed 18/185. MCP đối chiếu SQL khớp (41 dòng / 14.209.560 đ).

### Check Cost lấy hàng về trong kỳ từ phiếu nhập kho (C2) — CHƯA thử trên trình duyệt, CHƯA lên `staging`
Cột "Nhận trong kỳ" đổi nguồn: `SalesOrderItem.receivedQuantity` → `StockImportItem` của kho quán. Migration
chuyển 935 dòng SL nhận cũ thành **176 phiếu nhập** (chỉ đơn của tài khoản "Là quán", giữ đúng hành vi nguồn cũ).
Ô Thời gian của phiếu nhập đổi sang `datetime-local` — mốc kỳ có cả giờ nên ngày trần 00:00 làm hàng rơi ra
ngoài kỳ; mặc định cũ còn cắt chuỗi ISO theo UTC nên sau 17h điền sai ngày.
Thêm 409 khi tạo Check Cost cho quán chưa có kho, và bỏ đường "tính lại phiếu cũ chưa có snapshot" (giờ 409):
tính lại là dùng nguồn MỚI cho kỳ đã chốt bằng nguồn CŨ, rồi ghi vĩnh viễn chỉ vì ai đó mở trang.
Đã kiểm: **đối chiếu 10 phiếu Check Cost cũ, nguồn cũ vs nguồn mới khớp từng SKU, 0 phiếu lệch**; tổng SL
31598.999 khớp hai bên; `migrate deploy` DB trắng + `kho_dev_copy`; tạo phiếu thật ra 217005.000 / 25 hàng hoá,
khớp SQL độc lập; 10 phiếu cũ vẫn mở được.

### Kho riêng cho từng quán (C1) — CHƯA thử trên trình duyệt, CHƯA lên `staging`
`Warehouse.shopUserId @unique` + ô "Quán" ở Danh mục › Kho hàng; migration tạo 4 kho `KHOQ01..04` cho 4 quán.
Chặn: gán kho cho tài khoản không phải quán (400), một quán hai kho (409), xoá kho đang thuộc quán (409).
Sửa kèm một vết sẵn có: lỗi `ON DELETE RESTRICT` của Postgres là mã **23001** và nằm ở `err.cause.code`,
nên **mọi** phép xoá bị khoá ngoại chặn trong app đang trả 500 thay vì 409 — đã map lại ở `middleware/error.ts`.
Đã kiểm typecheck 2 app, lint web (0 lỗi/3 cảnh báo), `migrate deploy` trên **DB trắng** + `kho_db` + `kho_dev_copy`,
chạy lại migration không sinh kho trùng, và 8 ca curl (gồm: sửa tên kho không được âm thầm gỡ quán).
Còn lại C2–C6: đổi nguồn Check Cost, ô tích "Đã xử lý", sửa/xoá + ảnh phiếu nhập, dọn kho cũ.

### Build app mobile mới — code đã lên `main`
Mobile không có OTA nên các đợt sửa gần đây (tạo đơn vượt tồn ở **1.0.4**, màn Xử lý đơn, ô "Trừ CC",
công thức theo mốc, bỏ thẻ trạng thái push) chỉ có hiệu lực sau khi build lại.
**App production đang cài vẫn gọi `/confirm` và `/spend` đã xoá** → luồng đơn hàng và đề xuất chi hỏng
tới khi có build mới. Build bằng `npm run build:production` trong `apps/mobile` (script chặn sai nhánh).

---

## Còn lại

### Danh sách đơn tự cập nhật khi có đơn mới
Phần chuẩn bị xong (payload giảm 187 KB → 11,3 KB cho 20 đơn). Còn hai quyết định người dùng muốn
cân nhắc thêm:

1. **Chu kỳ poll** — bật `refetchInterval` và `refetchOnWindowFocus` (đang tắt tường minh trong
   `lib/query-client.tsx`). Poll giữ Render không ngủ: tốt cho quán, nhưng ăn quota 750 giờ/tháng.
2. **Dấu hiệu "đơn mới"** — số liệu tự đổi mà không ai nhìn thì cũng vô ích.

### Doanh số POS cho 3 quán còn lại
Chỉ Xuân La đã có dữ liệu POS. Check Cost giờ lấy SL bán từ `PosSaleHour` nên kỳ không có POS trả
**409** — 3 quán kia phải nhập dữ liệu mới tạo được phiếu. Mobile cố ý không có trang nhập doanh số.

---

## Đã quyết định KHÔNG làm

Ghi lại để không ai làm lại rồi mới biết là đã bỏ.

### Thông báo Zalo cho đơn mới — đã code xong rồi gỡ
Dùng Zalo Bot Platform (không phải Zalo OA), đã chạy thật: bắt được chat ID, gửi được tin, đơn mới
báo admin, đơn `PENDING_CONFIRM` báo đúng quán đặt. Người dùng quyết định gỡ hẳn.

Hai migration `20260811045843_zalo_bot_notifications` và `20260811162542_remove_zalo_notifications`
**cố ý giữ lại** trong lịch sử (thêm cột rồi xoá) vì migration đầu đã chạy trên staging.

Nếu làm lại, ba điểm khác tài liệu cộng đồng, đã kiểm chứng bằng bot thật:
- `getUpdates` là long polling, tham số `timeout` **ngược với Telegram** — `0` nghĩa là chờ vô hạn
- `getUpdates` trả về **một object đơn**, không phải mảng
- Tin nhắn **không được xếp hàng**: chỉ bắt được tin đến trong lúc đang chờ

### Sắp xếp trong nhóm ở Order nhanh
API `/reorder-thresholds` không có `orderBy` nên thứ tự là thứ tự vật lý của database, có thể tự
đổi sau khi sửa dữ liệu. Người dùng xem xong và quyết định để nguyên.

### Phát hiện quán bỏ hẳn một kỳ kiểm kê
Cơ chế chấm muộn chỉ đánh dấu được bản ghi **có tồn tại**. Quán bỏ hẳn một tuần rồi dán nhãn phiếu
sang tuần sau thì không bắt được — đó là bài toán "thiếu phiếu", không phải "nộp muộn". Người dùng
xác nhận việc bỏ phiếu tuần sẽ không xảy ra nên không xử lý. Đã chặn được đường lách dễ nhất (khai
ngày kiểm ở tương lai).

### Giới hạn theo quán cho Check Cost và Phiếu điều chuyển
Hai trang này không chịu mã `DATA.SCOPE_ALL`: ai có quyền Xem là thấy phiếu của mọi quán. Đã lên kế
hoạch sửa (Check Cost theo `userId`, điều chuyển theo quán gửi/nhận), người dùng quyết định giữ nguyên.

### Ô lọc "đúng hạn / muộn"
Chỉ cần chấm màu, không cần lọc.
