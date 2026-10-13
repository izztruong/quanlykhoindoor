# Tiến độ dự án

Cập nhật: 2026-10-13

Ghi **đúng những gì git không tự trả lời được**. Lý do thiết kế đã nằm trong commit message, đừng
chép lại vào đây. Mỗi mục "Đang dở" tối đa 3–4 dòng, và dòng quan trọng nhất luôn là: *đã kiểm thử
trên trình duyệt chưa, đã lên `main` chưa.*

Mục "Còn lại" chỉ gồm việc đã nêu ra rồi chủ động gác lại — không phải lộ trình tự nghĩ ra.

---

## Đã xong

Đang chạy trên `main`, đã bấm thử và đã tick quyền trên production. Chi tiết chức năng xem
`nav-config.ts` và `apps/server/src/modules/`.

- **Danh mục** — hàng hoá (có cờ `active`), nhóm, đơn vị, kho (gắn quán sở hữu), NCC, đồ thành phẩm
- **Kho** — phiếu nhập kho (sửa/xoá, ảnh chứng từ, nhập Excel nhiều phiếu), điều chuyển (nhập Excel),
  Check Cost; giá theo từng NCC
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
  quán ép ở server (phiếu nhập kho lọc theo **chủ kho**), đăng nhập Google (web + mobile) + đổi email,
  rate limit đăng nhập theo IP thật, phân trang 20 dòng, chống chèn công thức Excel,
  trang `/privacy-policy`, nhánh `dev` + chặn build/OTA sai nhánh

---

## Đang dở

### Check Cost & điều chuyển lọc theo quán — đã bấm thử trên trình duyệt, CHƯA lên `staging`
Check Cost neo theo `userId`, điều chuyển hiện cho **cả quán gửi lẫn quán nhận**; ô chọn quán/kho ở web
và mobile bỏ luôn quán khác khi vai trò không có `DATA.SCOPE_ALL`.
Đã kiểm: typecheck 3 app và một lượt curl trên `kho_db` với 3 quán thử — danh sách, chi tiết (404 ngoài
phạm vi), tạo/sửa/huỷ, nhập Excel lô, xem trước POS. Dữ liệu thử đã dọn.

### Phiếu nhập kho chọn được hàng NCC chưa khai giá — CHƯA bấm thử trên trình duyệt, CHƯA lên `staging`
Bỏ `assertSupplierPrices` ở server (3 lời gọi) và hai lớp lọc trên form web + mobile; hàng chưa khai giá
thì giá vốn để **0**. Mobile đổi fallback từ giá vốn danh mục sang 0 cho khớp web. Nhập Excel giữ nguyên:
để trống giá mà NCC chưa khai thì vẫn báo lỗi đúng dòng. Dòng giá 0 không đánh dấu gì, nên "Tổng tiền vốn"
sẽ thiếu phần đó — đã chốt chấp nhận.
Đã kiểm: typecheck 3 app, lint web 0 lỗi/3 cảnh báo, build web, `expo export`; và 5 ca curl trên
`kho_dev_copy` — tạo/sửa/bulk-import phiếu có dòng giá 0 đều qua (trước là 400), DB lưu `costPrice=0`
`costAmount=0`, và **tạo phiếu Check Cost thật phủ kỳ đó thì `receivedQty` của hàng giá 0 vẫn đủ**
(nền 0 → 5000 Gam cho 5 Kg). Dữ liệu thử đã dọn.

---

## Còn lại

### Vết sẵn có, đã biết mà chủ động gác lại
- **Sửa phiếu trên web trừ vỏ lần hai**: `subtractTareWeight` chạy ở cả POST lẫn PUT nên DB lưu lượng
  tịnh; mobile cộng vỏ ngược khi mở form sửa, web thì không. Dính cả 3 module dùng `tareWeight`.
- **`parseDateRange` lệch 7 tiếng**: `setHours` theo giờ máy chủ mà Render chạy UTC. Ảnh hưởng mọi ô
  lọc khoảng ngày, trong đó có phần xuất Excel theo bộ lọc.
- **Chưa làm Xuất Excel cho phiếu điều chuyển**: file bỏ cột SL lẻ, cộng với vết trừ vỏ ở trên thì xuất
  ra rồi nhập lại là sai số liệu im lặng.
- **Sửa/xoá phiếu nhập kho và ảnh chứng từ chỉ có trên web**, app mobile chỉ xem và tạo.
- **Vòng ảnh R2 thật chưa kiểm được**: `dev:copy` cố ý làm rỗng 4 biến `R2_*` để không xoá file thật.
- **`expo-doctor` báo 3 lỗi sẵn có**: `newArchEnabled` ngoài schema SDK 57, thiếu peer `expo-font` +
  `react-native-worklets`, 7 package lệch bản patch.

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
