# Tiến độ dự án

Cập nhật: 2026-09-17

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

### App mobile `apps/mobile` — người dùng đã chạy thử qua Expo Go, chưa lên `staging`/`main`
Đã có: đăng nhập, trang chủ, danh mục, kiểm kê quán, huỷ NVL, đơn hàng, chi chốt ca, đề xuất chi.
Bổ sung code: 5 báo cáo kiểm toán, nhập/xuất kho, điều chuyển, tài khoản, vai trò; bỏ menu ngoài phạm vi. CHƯA thử các màn mới trên điện thoại.
Kiểm: typecheck mobile/server/web, bundle Android; script kiểm quyền, chặn báo cáo thiếu kho, phân trang và giữ SL lẻ khi sửa điều chuyển.
Server đọc Bearer; danh sách điều chuyển bổ sung số dòng. Cần thử luồng tạo/sửa và cảnh báo Check Cost trên development build.

### Google Sign-In trên mobile — đã thử trên điện thoại, đang lỗi ở bước Google; chưa lên `staging`/`main`
Web Client ID trong mobile/build/server khớp nhau. Android client đã tạo; chưa xác minh cùng project và SHA-1 bản đang cài.
Đã bổ sung hiển thị mã lỗi native để chẩn đoán; cần tải lại Metro và thử lại để lấy mã cụ thể. Firebase push dùng project khác OAuth Web (chưa kết luận là nguyên nhân).
Chưa đăng nhập thành công; hướng dẫn chạy/build và kiểm thử: `apps/mobile/README.md`.

### Thông báo đẩy (đơn hàng + đề xuất chi) — server kiểm bằng curl; CHƯA nhận thử trên điện thoại
7 loại, mỗi người tự tắt/bật; migration `20260916141130_notifications` đã thử `migrate deploy` trên db trắng.
Đã kiểm đủ người nhận từng loại, tắt loại thì thôi nhận, token đổi chủ, push lỗi không làm hỏng request.
Cần: tài khoản Expo + Firebase, `eas build --profile development`, rồi thử nhận khi app đang đóng.

### Đăng nhập bằng Google + tự đổi email — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Chỉ vào được tài khoản có sẵn trùng email Gmail; đổi email ở Thông tin tài khoản (cần mật khẩu). Đã kiểm typecheck, lint,
curl (token rác 401, sai mật khẩu 401, trùng email khác hoa thường 409, đổi xong đăng nhập bằng email mới). Cần: bấm nút Google
thật (Gmail có/không có tài khoản); đặt `GOOGLE_CLIENT_ID` trên Render, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` trên Vercel rồi redeploy, thêm domain vào Authorized JavaScript origins.

### Rate limit đăng nhập tách theo IP thật (`trust proxy`) — chưa lên `staging`/`main`
Trước đây mọi request đứng sau proxy chung một bộ đếm: một quán sai 10 lần khoá cả chuỗi. Đã kiểm
bằng curl ở local: hai IP có bộ đếm riêng, đổi IP giả ở đầu `X-Forwarded-For` không lách được.
Cần thử trên staging: từ một máy gọi đăng nhập sai qua cả link Vercel lẫn thẳng `onrender.com` —
lượt còn lại phải trừ nối tiếp nhau (tức Render nhận đúng IP thật chứ không phải IP proxy trung gian).

### Phiếu đề xuất chi & tạm ứng — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Nhóm menu Tài chính (Chi chốt ca cũng chuyển sang đây). Có Loại phiếu (MKT / Vận hành / CSVC, lọc được), quán chi chọn tài khoản
quán, người xác nhận chọn tài khoản không phải quán (chỉ ghi nhận). Đã kiểm typecheck, lint, `migrate deploy` trên db trắng, curl
(2 luồng người lập chi / kế toán chi, sai thứ tự 409, thiếu quyền 403, sai vai trò hoặc thiếu loại phiếu 400, lọc theo loại).
Cần thử: ô tạm ứng ẩn/hiện theo Người chi, các ô chọn loại / quán / người xác nhận, lọc theo loại, thêm/xoá dòng, nút theo trạng thái.

### Cờ "Là quán" trên vai trò — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Ô chọn/lọc quán chỉ hiện tài khoản thuộc vai trò có tick (admin bị ẩn); lọc Người lập ở đề xuất chi vẫn thấy mọi tài khoản.
Đã kiểm typecheck, lint, `migrate deploy` trên db trắng, curl. Cần thử: tick/bỏ tick ở form vai trò, ô chọn quán ở đơn hàng, điều chuyển, Check Cost.

### Trang chủ — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Ô đơn chưa xác nhận, huỷ hàng 7 ngày, chi phí NVL tháng + biểu đồ tỷ lệ theo năm (từ Check Cost), lọc
theo quán. Đã kiểm typecheck, lint, curl (khớp số với danh sách đơn và chi tiết Check Cost, tiền huỷ
tính tay, 403 khi thiếu quyền, phạm vi SELF). Cần thử trên trình duyệt: đổi quán/năm, tooltip, màn hẹp,
nền trời có mây trông ổn chưa.

### Phân quyền theo vai trò — CHƯA kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Thay ADMIN/STAFF bằng vai trò tuỳ biến; migration `20260915030600_roles_and_permissions` chuyển
tài khoản cũ sang `Quản trị viên`/`Quán`. Đã kiểm typecheck, `migrate deploy` trên db trắng, curl
(chặn route, phạm vi quán, thu hồi tức thì, chống leo quyền). Trình duyệt mới mở sơ trang Vai trò; cần
thử kỹ: menu tick quyền, sửa tài khoản, menu/nút của tài khoản Quán y như cũ, vai trò hẹp chỉ thấy đúng trang.

### Chi chốt ca: Loại chi + ảnh chứng từ — đã kiểm thử trên trình duyệt, chưa lên `staging`/`main`
Sổ chi đã lên `main` từ trước; hai phần thêm sau thì chưa: Loại chi (NVL/Khác) và ảnh chứng từ (tối
đa 5 ảnh, nén ở trình duyệt, lưu trên Cloudflare R2 với URL ký hạn 1 giờ). Đã kiểm typecheck, lint,
curl, trọn vòng R2 thật (chặn URL không chữ ký, quá 5 ảnh / sai định dạng / quá nặng, khác quán
404, xoá ảnh và xoá khoản chi đều dọn sạch file) và **đã bấm thử trên trình duyệt, chạy tốt**.
Trước khi deploy **phải đặt 4 biến `R2_*` trên Render cả hai service** — chưa đặt thì phần ảnh tự
tắt (phần còn lại vẫn chạy). Lưu ý file Excel mẫu 6 cột cũ không nhập được nữa.

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
