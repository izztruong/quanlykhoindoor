# Tiến độ dự án

Cập nhật: 2026-08-20 · nhánh `staging` @ `5126d77`

Ghi lại **trạng thái thật**, không phải kế hoạch mong muốn. Mục "Còn lại" chỉ gồm những việc đã
được nêu ra và gác lại có chủ đích — không phải lộ trình tự nghĩ ra.

---

## Đã xong

Tất cả các mục dưới đây đã chạy trên production (nhánh `main`).

### Danh mục
Hàng hoá, nhóm hàng hoá, đơn vị tính, kho hàng, nhà cung cấp, khách hàng, đồ thành phẩm.
Hàng hoá có cờ `active` để ẩn khỏi ô chọn khi tạo phiếu/đơn mà vẫn giữ nguyên lịch sử.
Nhập/xuất Excel cho hầu hết danh mục.

### Kho
Phiếu nhập kho, phiếu xuất kho, phiếu kiểm kê kho, phiếu điều chuyển.
Giá theo từng nhà cung cấp (`ProductSupplierPrice`), có giá nhập và giá xuất riêng.

### Order
- Danh sách đơn hàng, tạo đơn, **Order nhanh** (đặt theo định lượng min/max từng quán)
- Luồng trạng thái: `DRAFT` → admin xác nhận kèm phân bổ NCC → `PENDING_CONFIRM` → quán xác nhận
  số lượng thực mua → `CONFIRMED` → nhận hàng → `COMPLETED`/`SHORT`
- Xác nhận đơn tự sinh phiếu xuất kho liên kết
- **Ngày nhận theo từng dòng hàng** (`SalesOrderItem.receivedAt`) — Check Cost tính theo mốc này
- Lọc theo tài khoản, xuất Excel (danh sách hàng hoá thuần), in hoá đơn (mẫu đầy đủ)
- **Tổng hợp đặt NCC**: gộp các đơn đang mở thành số lượng theo từng NCC, làm tròn theo quy cách bán

### Kiểm kê quán
- Phiếu kiểm kê quán (nguyên liệu + đồ thành phẩm), phiếu huỷ nguyên liệu
- Tự trừ khối lượng vỏ khỏi SL lẻ (`tareWeight`)
- Giá và thành tiền chốt tại thời điểm kiểm
- Phân loại **phiếu tuần / phiếu tháng**
- Nhập/xuất Excel

### Check Cost
- Báo cáo nguyên vật liệu + tổng hợp tài chính, tách theo nhóm món (Trà / ĐAV)
- **Chốt cứng số liệu** vào `reportSnapshot` lúc tạo phiếu
- Huỷ mềm phiếu; sửa phiếu gốc thì cảnh báo admin tạo lại phiếu Check Cost bị ảnh hưởng
- Công thức (BOM) cho đồ thành phẩm, xuất Excel

### Kiểm toán
5 báo cáo chỉ đọc: Kiểm kê, Chi tiết/Tổng hợp xuất, Chi tiết/Tổng hợp nhập.

### Đánh dấu nộp muộn
Chấm xanh/đỏ/xám trên danh sách đơn hàng và phiếu kiểm kê, cấu hình hạn ở
**Quản trị → Hạn order & kiểm kê**. Hạn hiện tại: đơn 22:00 hằng ngày, phiếu tuần 12:00 Thứ 3,
phiếu tháng 12:00 mùng 1. Dấu chốt lúc tạo bản ghi nên đổi lịch không viết lại lịch sử.

### Nền tảng
Đăng nhập cookie JWT có `tokenVersion`, phân quyền ADMIN/STAFF, giới hạn theo chủ sở hữu ép ở
server, phân trang mọi danh sách (20 dòng), chống chèn công thức Excel, rate limit đăng nhập.
42 migration.

---

## Đang dở

### Sidebar thu gọn theo nhóm — đã commit, CHƯA kiểm thử trên trình duyệt
`5126d77`. Sidebar 27 mục trong 6 nhóm giờ gập lại được: nhóm chứa trang đang xem tự mở, bấm
tiêu đề để đóng/mở, đổi route thì xoá hết ghi đè nên không bao giờ giấu mất trang vừa mở.

Đã qua typecheck và `eslint` sạch, nhưng **chưa ai mở trên trình duyệt lần nào**. Cần bấm thử
đóng/mở vài nhóm và điều hướng chéo sang nhóm khác — typecheck không bắt được lỗi hành vi.

### Chưa push
`staging` đi trước `origin/staging` 4 commit: `7dfa309`, `3b29d57` (CLAUDE.md),
`bc4f18f` (chính file này), `5126d77` (Sidebar). `main` chưa có commit nào trong số đó.

---

## Còn lại

Đều là việc đã bàn và **chủ động gác lại**, kèm lý do — không phải việc bỏ quên.

### Danh sách đơn tự cập nhật khi có đơn mới
Việc chuẩn bị đã xong: payload danh sách giảm từ 187 KB xuống 11,3 KB cho 20 đơn, nên poll giờ
rẻ. Hai phần còn lại người dùng muốn cân nhắc thêm:

1. **Chu kỳ poll** — bật `refetchInterval` (và `refetchOnWindowFocus`, hiện đang tắt tường minh
   trong `lib/query-client.tsx`). Ở 30 giây tốn ~1,4 MB/giờ. Lưu ý poll giữ Render không ngủ:
   tốt cho quán (không phải chờ khởi động lạnh) nhưng ăn vào quota 750 giờ/tháng của gói free.
2. **Dấu hiệu "đơn mới"** — số liệu tự đổi mà admin không nhìn thì cũng không biết. Cần một dòng
   kiểu "Có 2 đơn mới" hoặc tô nền đơn xuất hiện từ lần xem trước.

### Nâng gói Render
Gói free ngủ sau 15 phút (đơn đầu ngày chờ 30–60 giây) và **bị khoá trước tiên khi Render gặp sự
cố hạ tầng** — đã xảy ra thật ngày 20/08, cả hai service chết trong khi gói trả phí không bị.
$7/tháng giải quyết cả hai. Đã nêu, chưa quyết.

---

## Đã quyết định KHÔNG làm

Ghi lại để không ai làm lại rồi mới biết là đã bỏ.

### Thông báo Zalo cho đơn mới — đã code xong rồi gỡ
Dùng Zalo Bot Platform (không phải Zalo OA), đã chạy thật: bắt được chat ID, gửi được tin, đơn
mới báo admin, đơn `PENDING_CONFIRM` báo đúng quán đặt. Người dùng quyết định gỡ hẳn.

Hai migration `20260811045843_zalo_bot_notifications` và `20260811162542_remove_zalo_notifications`
**cố ý giữ lại** trong lịch sử (thêm cột rồi xoá) vì migration đầu đã chạy trên staging.

Nếu làm lại, ba điểm khác tài liệu cộng đồng đã kiểm chứng bằng bot thật:
- `getUpdates` là long polling, tham số `timeout` **ngược với Telegram** — `0` nghĩa là chờ vô hạn
- `getUpdates` trả về **một object đơn**, không phải mảng
- Tin nhắn **không được xếp hàng**: chỉ bắt được tin đến trong lúc đang chờ

### Sắp xếp trong nhóm ở Order nhanh
API `/reorder-thresholds` không có `orderBy` nên thứ tự là thứ tự vật lý của database, có thể tự
đổi sau khi sửa dữ liệu. Người dùng xem xong và quyết định để nguyên.

### Phát hiện quán bỏ hẳn một kỳ kiểm kê
Cơ chế chấm muộn chỉ đánh dấu được bản ghi **có tồn tại**. Quán bỏ hẳn một tuần rồi dán nhãn phiếu
sang tuần sau thì không bắt được — đó là bài toán "thiếu phiếu", không phải "nộp muộn". Người dùng
xác nhận việc bỏ phiếu tuần sẽ không xảy ra nên không xử lý. Đã chặn được đường lách dễ nhất
(khai ngày kiểm ở tương lai).

### Ô lọc "đúng hạn / muộn"
Chỉ cần chấm màu, không cần lọc.
