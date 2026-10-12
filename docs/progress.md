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

### Đợt "bỏ kho tổng" — đã bấm thử xong, đang ở `staging`, CHƯA lên `main`
16 commit đi cùng nhau vì chúng phá nhau nếu tách: mỗi quán một kho · Check Cost lấy "Nhận trong kỳ" từ
phiếu nhập kho của quán thay vì SL nhận của đơn · đơn hàng chỉ còn là đề xuất + ô tích "Đã xử lý" ·
phiếu nhập kho thành đường ghi chính (sửa/xoá, ảnh chứng từ, phạm vi theo **chủ kho**) · xoá phiếu xuất,
kiểm kê kho, Khách hàng, cả nhóm Kiểm toán · nhập Excel nhiều phiếu một lần cho phiếu nhập kho và phiếu
điều chuyển · app mobile theo kịp (bỏ 11 màn, còn 3 tab) · dựng EAS Update + shim giữ app 1.0.4 sống ·
sửa tấm trượt iOS bị bàn phím che.
Đã bấm thử trên trình duyệt và trên máy (iOS + Android), không lỗi.

### Đưa lên `main` và phát hành app 1.0.5 — thứ tự bắt buộc
1. Merge `staging` → `main`. **Shim `/dashboard/unconfirmed-orders` phải lên cùng đợt** với phần đã
   dọn: thiếu nó thì app 1.0.4 đang cài dừng vĩnh viễn ở màn chờ.
2. Build 1.0.5 từ `main` (`npm run build:production` / `:ios`) rồi nộp hai store.
3. Theo log `[legacy] /dashboard/unconfirmed-orders` trên Render. Im vài ngày = không còn máy nào ở
   1.0.4 → commit server xoá shim. **"Được duyệt" không phải tín hiệu**, người dùng vẫn ở lại bản cũ.
Từ 1.0.5 trở đi, đổi JS thì `npm run update:production` (OTA), không phải chờ duyệt.

### Vết sẵn có, đã biết mà chưa sửa
- **Sửa phiếu trên web trừ vỏ lần hai**: `subtractTareWeight` chạy ở cả POST lẫn PUT nên DB lưu lượng
  tịnh; mobile cộng vỏ ngược khi mở form sửa, web thì không. Dính cả 3 module dùng `tareWeight`.
- **`parseDateRange` lệch 7 tiếng**: `setHours` theo giờ máy chủ mà Render chạy UTC. Ảnh hưởng mọi ô
  lọc khoảng ngày, trong đó có phần xuất Excel theo bộ lọc.
- **Chưa làm Xuất Excel cho phiếu điều chuyển**: file bỏ cột SL lẻ, cộng với vết trừ vỏ ở trên thì xuất
  ra rồi nhập lại là sai số liệu im lặng.
- **Sửa/xoá phiếu nhập kho và ảnh chứng từ chỉ có trên web**, app mobile chỉ xem và tạo.
- **Vòng ảnh R2 thật chưa kiểm được**: `dev:copy` cố ý làm rỗng 4 biến `R2_*` để không xoá file thật.
- **`expo-doctor` báo 3 lỗi sẵn có**: `newArchEnabled` ngoài schema SDK 57, thiếu peer `expo-font` +
  `react-native-worklets`, 7 package lệch bản patch. Để sau khi 1.0.5 lên store hẵng đụng.

---

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
