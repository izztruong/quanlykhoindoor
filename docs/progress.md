# Tiến độ dự án

Cập nhật: 2026-09-15

Ghi **đúng những gì git không tự trả lời được**. Lý do thiết kế đã nằm trong commit message, đừng
chép lại vào đây. Mỗi mục "Đang dở" tối đa 3–4 dòng, và dòng quan trọng nhất luôn là: *đã kiểm thử
trên trình duyệt chưa, đã lên `main` chưa.*

Mục "Còn lại" chỉ gồm việc đã nêu ra rồi chủ động gác lại — không phải lộ trình tự nghĩ ra.

---

## Đã xong

Đang chạy trên `main`. Chi tiết chức năng xem `nav-config.ts` và `apps/server/src/modules/`.

- **Danh mục** — hàng hoá (có cờ `active`), nhóm, đơn vị, kho, NCC, khách hàng, đồ thành phẩm
- **Kho** — phiếu nhập, xuất, kiểm kê kho, điều chuyển; giá theo từng NCC
- **Order** — danh sách, tạo đơn, Order nhanh, luồng 6 trạng thái, ngày nhận theo từng dòng hàng,
  Tổng hợp đặt NCC
- **Kiểm kê quán** — phiếu kiểm (tuần/tháng), phiếu huỷ nguyên liệu, tự trừ vỏ
- **Check Cost** — báo cáo NVL + tổng hợp tài chính, snapshot chốt cứng, huỷ mềm, công thức BOM,
  gộp báo cáo theo loại rồi nhóm hàng hoá
- **Kiểm toán** — 5 báo cáo chỉ đọc
- **Đánh dấu nộp muộn** — chấm xanh/đỏ/xám trên đơn hàng và phiếu kiểm, cấu hình hạn ở Quản trị
- **Sidebar** thu gọn theo nhóm
- **Nền tảng** — JWT cookie có `tokenVersion`, phân quyền ADMIN/STAFF, giới hạn theo chủ sở hữu ép
  ở server, phân trang 20 dòng, chống chèn công thức Excel, rate limit đăng nhập

---

## Đang dở

### Phân quyền theo vai trò — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Thay ADMIN/STAFF bằng vai trò tuỳ biến; migration `20260915030600_roles_and_permissions` chuyển
tài khoản cũ sang `Quản trị viên`/`Quán`. Đã kiểm typecheck, `migrate deploy` trên db trắng, curl
(chặn route, phạm vi quán, thu hồi tức thì, chống leo quyền). Trình duyệt mới mở sơ trang Vai trò; cần
thử kỹ: menu tick quyền, sửa tài khoản, menu/nút của tài khoản Quán y như cũ, vai trò hẹp chỉ thấy đúng trang.

### Chi chốt ca — đã lên `main`, phần Loại chi CHƯA kiểm thử trên trình duyệt
Sổ chi tiêu của quán, mỗi khoản là một bản ghi phẳng. Có nhập/xuất Excel.

Đã kiểm bằng typecheck, lint và curl (kể cả phần Loại chi NVL/Khác). **Trên trình duyệt mới chỉ mở
phần cũ**, chưa bấm thử Loại chi.

Cần thử: thêm/sửa một khoản và đổi loại; lọc theo loại · ngày · quán; nhập file Excel mẫu rồi đối
chiếu Tổng chi = 1.241.000 (NVL 984.000 + Khác 257.000); xuất ra rồi nhập lại chính file đó.

**Lưu ý khi nhập Excel**: thêm cột Loại chi làm file mẫu cũ 6 cột không nhập được nữa — đúng ý đồ,
bị chặn ở bước kiểm tiêu đề. Nhập Excel chỉ thêm mới, không ghi đè, nên nhập lại cùng file sẽ nhân
đôi dòng.

---

## Còn lại

### Danh sách đơn tự cập nhật khi có đơn mới
Phần chuẩn bị xong (payload giảm 187 KB → 11,3 KB cho 20 đơn). Còn hai quyết định người dùng muốn
cân nhắc thêm:

1. **Chu kỳ poll** — bật `refetchInterval` và `refetchOnWindowFocus` (đang tắt tường minh trong
   `lib/query-client.tsx`). Poll giữ Render không ngủ: tốt cho quán, nhưng ăn quota 750 giờ/tháng.
2. **Dấu hiệu "đơn mới"** — số liệu tự đổi mà không ai nhìn thì cũng vô ích.

### Nâng gói Render
Gói free ngủ sau 15 phút và **bị khoá trước tiên khi Render gặp sự cố hạ tầng** — đã xảy ra thật
ngày 20/08, cả hai service chết trong khi gói trả phí không bị. $7/tháng. Đã nêu, chưa quyết.

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
