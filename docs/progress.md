# Tiến độ dự án

Cập nhật: 2026-11-11

Ghi **đúng những gì git không tự trả lời được**. Lý do thiết kế đã nằm trong commit message, đừng
chép lại vào đây. Mỗi mục "Đang dở" tối đa 3–4 dòng, và dòng quan trọng nhất luôn là: *đã kiểm thử
trên trình duyệt chưa, đã lên `main` chưa.*

Mục "Còn lại" chỉ gồm việc đã nêu ra rồi chủ động gác lại — không phải lộ trình tự nghĩ ra.

---

## Đã xong

Đang chạy trên `main`, đã bấm thử và đã tick quyền trên production. Chi tiết chức năng xem
`nav-config.ts` và `apps/server/src/modules/`.

- **Danh mục** — hàng hoá (có cờ `active`), nhóm, đơn vị, kho (gắn quán sở hữu), NCC, đồ thành phẩm
- **Kho** — phiếu nhập kho (sửa/xoá, nhập Excel nhiều phiếu với **mã phiếu tự đặt**, đính ảnh chứng
  từ hàng loạt theo tên file), điều chuyển (nhập Excel), Check Cost; giá theo từng NCC
- **Order** — danh sách, tạo đơn, Order nhanh, Tổng hợp đặt NCC. Đơn chỉ là **đề xuất**: Đã đặt → Huỷ,
  cộng ô tích "Đã xử lý" để admin đánh dấu đơn đã làm
- **Kiểm kê quán** — phiếu kiểm (tuần/tháng), phiếu huỷ nguyên liệu (ô tích "Trừ CC" từng dòng), tự trừ vỏ
- **Check Cost** — báo cáo NVL + tổng hợp tài chính, snapshot chốt cứng, huỷ mềm, công thức BOM và giá
  bán theo mốc hiệu lực, SL món đã bán lấy từ POS, cột "% chênh lệch thực", gộp báo cáo theo loại.
  Cột "Nhận trong kỳ" lấy từ phiếu nhập kho của kho quán
- **Doanh số POS** — nhập Excel, gõ tay từng dòng, nhập thẳng từ file nhật ký order của POS; Ánh xạ
  món POS; Khung giờ ca
- **Tài chính** — Đề xuất chi (tạm ứng nhiều lần, duyệt bổ sung hạng mục, hoàn thành + chứng từ),
  Chi chốt ca (Loại chi, ảnh R2, cột Đã chi + Ngày lập phiếu), Chi ngoài
- **Đánh dấu nộp muộn** — chấm xanh/đỏ/xám trên đơn hàng và phiếu kiểm, cấu hình hạn ở Quản trị
- **Trang chủ** — phiếu nhập kho 7 ngày, huỷ hàng 7 ngày, chi phí NVL tháng + biểu đồ tỷ lệ theo năm,
  lọc theo quán
- **MCP** — `/mcp` chỉ đọc 12 tool + trang Token MCP; connector claude.ai đã nối được trên production
- **App mobile** — 3 tab, màn hình chờ khởi động, thông báo đẩy 7 loại, Check Cost, công thức theo mốc,
  ghi nhớ đăng nhập, nhãn LOCAL/STAGING. **EAS Update**: đổi JS phát hành thẳng, không qua store
- **Phát hành** — **1.0.5 đã lên cả CH Play và App Store**; iOS ẩn nút Google (Guideline 4.8), tắt iPad,
  phát hành dạng Unlisted
- **Nền tảng** — JWT cookie có `tokenVersion`, vai trò tuỳ biến + cờ "Là quán", phạm vi dữ liệu theo
  quán ép ở server (phiếu nhập kho theo **chủ kho**, Check Cost theo quán được check, điều chuyển cho
  **cả quán gửi lẫn quán nhận**), đăng nhập Google (web + mobile) + đổi email,
  rate limit đăng nhập theo IP thật, phân trang 20 dòng, chống chèn công thức Excel,
  trang `/privacy-policy`, nhánh `dev` + chặn build/OTA sai nhánh

---

## Đang dở

### Ảnh chứng minh cho phiếu huỷ (server + web + mobile) — CHƯA thử trên trình duyệt/app, CHƯA lên `main`
Tối đa 5 ảnh/phiếu, đính ngay lúc tạo (quyền Thêm là đủ) hoặc lúc sửa; gỡ ảnh đã lưu cần quyền Sửa; xem ở trang chi tiết. Xoá phiếu dọn cả file trên R2.
Đã kiểm typecheck 3 app, lint web, bundle Android, `migrate deploy` DB trắng + `kho_db` + `kho_dev_copy`, 9 ca curl với R2 thật.

### Đề xuất chi: hoàn thành thẳng từ "Đã duyệt", đề nghị tạm ứng được 0 — ĐÃ lên `main` + OTA Android/iOS, CHƯA bấm thử
Tạm ứng không còn bắt buộc trước Hoàn thành (server + web + mobile); ô đề nghị tạm ứng nhận 0, lần tạm ứng
thật vẫn phải > 0. **Server phải lên trước app/web** — server cũ trả 409 cho nút Hoàn thành ở phiếu Đã duyệt.
Đã kiểm: typecheck 3 app, lint web, `expo export`, 13 ca curl trên `kho_db`. Dữ liệu thử đã dọn.

### Lịch chọn ngày trên iOS bị cắt mất Thứ 6–CN — ĐÃ lên `main` + OTA iOS/Android, CHƯA thử trên máy thật
Lịch inline của iOS mở ngay dưới ô nên chỉ rộng bằng ô; ở bộ lọc khoảng ngày (8 màn) mỗi ô nửa màn hình
nên ngày Thứ 6–CN không chạm được. Giờ mở trong tấm trượt rộng cả màn hình (`ui/DateTimeField.tsx`).
OTA chở theo phần mobile của `8c62b79` (bỏ cộng bù vỏ ở form sửa điều chuyển) — đã tới cả Android (`d43fa04`).

### Đơn bánh (web) — CHƯA bấm thử trên trình duyệt, CHƯA lên `main`, chưa làm app
Quán đặt → tiệm bánh XN → vận chuyển lấy → quán nhận (tự sinh phiếu nhập kho); admin sửa SL/ngày nhận sau hoàn thành.
Đã kiểm: typecheck server + web, `next build`, migration trên DB trắng, 44 ca curl + route options (dữ liệu thử đã dọn).
**Trước khi dùng**: nối NCC với tài khoản tiệm bánh, khai giá NCC cho bánh, tạo vai trò Vận chuyển (VIEW + PICKUP + DATA.SCOPE_ALL), tick quyền Đơn bánh cho vai trò quán/tiệm bánh.

### Sửa phiếu chỉ trừ vỏ dòng có SL lẻ đổi — CHƯA lên `main`, CHƯA bấm thử trên trình duyệt
`main` đang có bản bỏ hẳn trừ vỏ ở PUT; bản này trừ lại cho dòng đổi, dòng không đụng tới giữ nguyên.
App cũ (cộng bù vỏ ở form sửa điều chuyển) nhờ vậy cũng ra đúng số — không cần OTA gấp.
Đã kiểm: typecheck server + web; 10 ca curl trên `kho_db` cho cả 3 loại phiếu (dữ liệu thử đã dọn).
Phiếu đã bị trừ lố trước bản sửa **không tự khôi phục** — phải soát tay.

### Màn Hoàn thành trên app hết treo khi chọn ảnh — CHƯA thử trên máy thật, CHƯA lên `main`
Bước nén ảnh có trần 30 giây (`imagePicker.ts`, chỉ tính từ lúc bộ chọn ảnh trả về — thời gian lướt
thư viện vẫn vô hạn), và nút Hoàn thành không còn khoá theo cờ nén ảnh; bấm lúc ảnh đang nén thì hỏi
lại. Timeout nằm ở helper dùng chung nên Tạm ứng, Chi chốt ca, Chi ngoài cũng hết treo.
Đã kiểm: typecheck, `expo export`, và script tạm chạy thử 6 ca của helper (xong trước hạn, treo quá
hạn, lỗi thật, lỗi về muộn không sinh unhandled rejection, dọn hẹn giờ). Script đã xoá.
**Chưa biết chặng nào treo thật**: phần ghi log từng chặng đã đề xuất nhưng chưa làm.

### Xoá phiếu huỷ nguyên liệu (server + web + mobile) — CHƯA thử trên trình duyệt/app, CHƯA lên `main`
Nút Xoá ở trang chi tiết, quyền mới `MATERIAL_WASTE.DELETE`; trả danh sách phiếu Check Cost bị ảnh hưởng như xoá phiếu nhập.
Đã kiểm typecheck 3 app, lint web, bundle Android, 5 ca curl (403 thiếu quyền, 200 + affectedCostChecks, dòng xoá theo, 404 xoá lại).
**Sau khi deploy phải tick "Xoá" ở mục Phiếu huỷ nguyên liệu** — không tick thì ngoài admin không ai thấy nút.

### Đề xuất chi: bỏ ô "Người chi" + lọc theo Quán chi — ĐÃ lên `main`, CHƯA bấm thử trên trình duyệt
Mọi phiếu đi luồng người lập chi (bắt buộc số tạm ứng + ngày trả hoá đơn); migration xoá cột `payer`.
Đã kiểm: typecheck 3 app, lint web, `expo export`; migrate trên DB trắng + `kho_db` + `kho_dev_copy`,
drift rỗng; 9 ca curl trên `kho_dev_copy` (thiếu tạm ứng/ngày → 400, app cũ gửi `payer` vẫn tạo được,
lọc `shopId` đúng, Duyệt → Tạm ứng → Hoàn thành). Dữ liệu thử đã dọn.

### Đề xuất chi: bỏ "Thêm hạng mục chi dự kiến", Hoàn thành được chi vượt — ĐÃ lên `main`, CHƯA bấm thử
Vượt dự kiến chỉ còn cảnh báo vàng. Migration chỉ trả phiếu `REAPPROVAL` về trạng thái trước; cột/enum giữ làm lịch sử.
Đã kiểm: typecheck 3 app, lint web, `expo export`; migrate DB trắng + `kho_db` + `kho_dev_copy`, drift rỗng;
curl trên `kho_dev_copy`: hoàn thành 180k trên phiếu dự kiến 100k → SPENT, `POST /revision` → 404. Đã dọn.

### Đính ảnh chứng từ ngay lúc Tạm ứng (đề xuất chi) — ĐÃ lên `main` (web + API), ĐÃ đẩy OTA, CHƯA bấm thử
Hộp Tạm ứng có ô ảnh; ảnh vào chung mục Chứng từ, mục này hiện từ lúc Đã tạm ứng. Trần 5 → 10 ảnh/phiếu.
Đã kiểm typecheck 3 app, lint web, `expo export`; curl trên `kho_dev_copy` chỉ qua được tới cổng R2
(`dev:copy` tắt R2) — **vòng tải ảnh thật chưa thử, thử trên staging trước**.

### Menu & nguyên liệu riêng theo quán — CHƯA lên `main`, CHƯA bấm thử trên trình duyệt
Bốn migration: `FinishedGoodItemShop`, `ProductShop`, `shopUserId` trên `FinishedGoodPrice` và
`FinishedGoodRecipeVersion`. Quy ước **chưa gán quán nào = mọi quán đều thấy** nên chưa tích ô nào
thì toàn bộ là no-op. Trang `/admin/finished-good-menus` hai tab; ô chọn phạm vi "Chung / từng quán"
ở trang giá bán và trang công thức.
Đã kiểm: typecheck 3 app, lint web, build web, `expo export`; `migrate deploy` trên DB trắng +
`kho_db` + `kho_dev_copy`, drift check ra migration RỖNG; 17 ca script `tsx` cho luật đắp bù
riêng→chung (gồm `productIdsInWindow` không làm nguyên liệu sống lại) — script đã xoá; ~30 ca curl
(ép phạm vi, 409 widening + `hasHistory`, sửa phiếu cũ có món đã rời menu vẫn được, mirror KHÔNG xê
dịch khi khai giá riêng, `?active=true` vẫn lọc sau khi tiếp quản `GET /products`). Dữ liệu thử đã dọn.
**Lưu ý**: lúc dọn đã xoá luôn 1 mốc giá chung cũ của món M043 trên `kho_dev_copy` — nạp lại bản copy
nếu cần lịch sử giá của món đó.

### Tiệm bánh: cờ `isBakery`, Bánh bán ra, Check Cost riêng — CHƯA lên `main`, CHƯA bấm thử trên trình duyệt
Tiệm bánh dùng lại toàn bộ đầu vào của quán (kho, phiếu nhập, phiếu kiểm, phiếu huỷ, điều chuyển);
chỉ trục bán ra là mới (`BakerySale`, độ mịn ngày × người mua × bánh, `shopUserId = null` = bán ngoài).
Công thức và giá xuất dùng **bản riêng theo quán** đã có nên **không tạo bản ghi bánh mới nào**.
Phiếu là một dòng `CostCheck`, phân biệt bằng `role.isBakery`; đặt trong module `costChecks` chứ không
tách module — tách thì phải chép 400 dòng tính báo cáo hoặc gọi service module khác.
Đã kiểm: typecheck 3 app, lint + build web; migrate trên DB trắng + `kho_db` + `kho_dev_copy`, drift
check rỗng; 10 ca curl với dữ liệu thử `ZZ-*` — mọi con số khớp tính tay (doanh thu 1.000.000 theo
GIÁ XUẤT chứ không phải giá bán lẻ, định mức 280.000/28%, thực 300.000/30%, lệch +20.000/2%), hàng
`ZZ-BANH` không sống lại từ bản công thức chung, đường TÍNH LẠI không truyền `sales` vẫn ra định mức
đúng, index một phần chặn trùng dòng bán ngoài. **Dữ liệu thử `ZZ-*` còn trên `kho_dev_copy`** để bấm thử.

### Điều chuyển tự gán hàng cho quán nhận — CHƯA lên `main`, CHƯA bấm thử trên trình duyệt
Phép chặn ở `materialTransfers` đổi sang neo theo **quán gửi** (trước đó neo theo người đăng nhập nên
cùng một phiếu A→B được khi A gõ, bị chặn khi B gõ), và `grantProductsToShop` gán hàng cho quán nhận
trong cùng transaction ở cả POST/PUT/Excel — không gán thì quán giữ hàng mà phiếu kiểm không hiện
dòng, Check Cost tính tồn cuối kỳ bằng 0. Hàng **chưa gán quán nào** cố ý KHÔNG gán (gán sẽ thu hẹp
nó về đúng quán nhận). Đã kiểm 7 ca curl gồm đúng bẫy đó; dữ liệu thử đã dọn.

### Xuất Excel phiếu nhập kho có thêm cột "Tên NCC" — ĐÃ lên `main`, CHƯA bấm thử trên trình duyệt
Thêm ở **cả hai sheet**, nối sau khối cột mẫu nên phần nhập vẫn bỏ qua như "Người tạo"/"Tên hàng hoá" —
file xuất ra vẫn nhập lại được. Sheet "Dòng hàng" lặp tên NCC ở mọi dòng vì NCC là của cả phiếu.
Đã kiểm: typecheck + lint (0 lỗi/3 cảnh báo) + build web; 11 ca script `tsx` tạm dựng workbook rồi đọc
lại, gồm **headerMatchesPhieu/DongHang vẫn true** và phiếu không có NCC ra ô rỗng. Script đã xoá.

### Dải "Tiền quỹ đã xuất" dưới danh sách phiếu đề xuất chi — ĐÃ lên `main`, CHƯA bấm thử trên trình duyệt
Server cộng cho cả bộ lọc: phiếu Hoàn thành tính theo thực chi, phiếu còn dở tính theo tiền đã tạm ứng.
Web có dải dưới bảng, mobile có thẻ ở đầu danh sách (màn này phải bỏ `useInfiniteList` vì hook đó không
mang được trường tổng).
Đã kiểm: typecheck 3 app, lint web, `expo export`, và 11 ca curl trên `kho_db` (lọc trạng thái/ngày/người
lập, sang trang 2 không đổi tổng, tài khoản quán chỉ cộng phiếu của mình). Dữ liệu thử đã dọn.

### Phiếu nhập kho chọn được hàng NCC chưa khai giá — ĐÃ lên `main`, CHƯA bấm thử trên trình duyệt
Hàng chưa khai giá thì giá vốn để **0**, nên "Tổng tiền vốn" thiếu phần đó — đã chốt chấp nhận.
Đã kiểm bằng typecheck/build/`expo export` và curl trên `kho_dev_copy` (kể cả một phiếu Check Cost thật
phủ kỳ có dòng giá 0). Còn thiếu đúng một lượt bấm trên trình duyệt production.

### Bản OTA 15/10 trỏ nhầm `localhost` — đã sửa xong, ĐÃ xác nhận trên máy thật (Android)
Bản đẩy buổi sáng thiếu `EXPO_PUBLIC_API_URL` (environment `production` trên EAS rỗng; `eas update`
không đọc `env` của `eas.json`), app rơi về `http://localhost:4000/api` nên đứng ở "Chưa tải được
dữ liệu" trên cả hai nền tảng. Đã khai 3 biến cho cả `production` lẫn `preview`, đẩy lại Android +
iOS và soát `dist` thấy đúng URL production. Người dùng đã mở nguội app trên Android và vào được.

### Phần mobile đã đẩy OTA tới điện thoại — CHƯA bấm thử trên máy thật
Đẩy lên channel `production` cho cả hai nền tảng, runtime khớp đúng fingerprint bản 1.0.5 đang cài
(`b1d0e9bd…` Android, `a9f58888…` iOS). **Bản update chỉ áp dụng ở lần mở NGUỘI kế tiếp.**
Phát hiện khi làm: 4 script `update:*` trong `apps/mobile/package.json` chạy không tương tác là hỏng
(thiếu `--message`, `--environment`, `--platform`), **nhưng không sửa được** — fingerprint băm cả
`package.json` nên thêm một dòng `scripts` cũng làm OTA không tới được máy nào. Cách gọi đúng đã ghi
vào `CLAUDE.md`; sửa script để dành cho đợt có build native mới.

---

## Còn lại

### Vết sẵn có, đã biết mà chủ động gác lại
- **`parseDateRange` lệch 7 tiếng**: `setHours` theo giờ máy chủ mà Render chạy UTC. Ảnh hưởng mọi ô
  lọc khoảng ngày, trong đó có phần xuất Excel theo bộ lọc.
- **Chưa làm Xuất Excel cho phiếu điều chuyển**: file bỏ cột SL lẻ; thêm cột thì xuất ra lượng
  TỊNH mà nhập lại bị trừ vỏ lần nữa — sai số liệu im lặng.
- **Sửa/xoá phiếu nhập kho và ảnh chứng từ chỉ có trên web**, app mobile chỉ xem và tạo.
- **Vòng ảnh R2 thật chưa kiểm được**: `dev:copy` cố ý làm rỗng 4 biến `R2_*` để không xoá file thật.
- **`expo-doctor` báo 3 lỗi sẵn có**: `newArchEnabled` ngoài schema SDK 57, thiếu peer `expo-font` +
  `react-native-worklets`, 7 package lệch bản patch.
- ~~Lệch web/mobile ở ô chọn món phiếu huỷ~~ — đã gộp: mobile bỏ bộ lọc `THANH_PHAM`, giống web.

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

### Ô lọc "đúng hạn / muộn"
Chỉ cần chấm màu, không cần lọc.
