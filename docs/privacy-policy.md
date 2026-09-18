# Chính sách quyền riêng tư

Trang công khai: https://quanlykhoindoor.vercel.app/privacy-policy.
Liên kết tới hướng dẫn yêu cầu xoá: https://quanlykhoindoor.vercel.app/privacy-policy#yeu-cau-xoa.
Trang không cần đăng nhập. Chỉ điền URL vào Google Play sau khi deploy web và mở thử bằng cửa sổ ẩn danh.

Thông tin đã được người vận hành xác nhận: **Trương Thái**, **truongthaici1@gmail.com**;
hoàn tất xoá dữ liệu trong vòng **30 ngày kể từ khi nhận yêu cầu xoá hợp lệ**.
Thông tin liên hệ/ngày cập nhật ở `apps/web/src/lib/privacyPolicy.ts`, nội dung lưu/xoá ở
`apps/web/src/app/privacy-policy/page.tsx`, các mục dữ liệu và nhà cung cấp ở component `PrivacyPolicy.tsx`.

## Xử lý yêu cầu xoá

Đây là cam kết vận hành qua email, không phải tác vụ tự động xoá sau 30 ngày.
Người vận hành cần theo dõi hộp thư, xác minh người yêu cầu có quyền đối với tài khoản/dữ liệu,
ghi nhận ngày nhận yêu cầu hợp lệ và xử lý trong thời hạn đã công bố.
Khi xử lý, kiểm tra tài khoản, dữ liệu liên quan, token thông báo, ảnh chứng từ và các bản sao lưu
thuộc phạm vi yêu cầu; xác minh kết quả rồi trả lời email. Không yêu cầu người dùng gửi mật khẩu/mã xác thực.

Chức năng xoá hiện tại có thể bị ràng buộc dữ liệu nghiệp vụ; xoá ảnh R2 thất bại chỉ ghi log.
Không coi một thao tác xoá trên giao diện là bằng chứng đã hoàn tất toàn bộ yêu cầu.
Nếu có dữ liệu hoặc bản sao lưu cần cách xử lý riêng, người vận hành phải kiểm tra và thực hiện
quy trình tương ứng để đáp ứng cam kết; đợt làm trang chính sách này không thay đổi cơ chế lưu/xoá của server.

## Công bố

- Deploy web, kiểm tra URL công khai và email liên hệ. Chưa deploy trong đợt này.
- Khai URL chính sách trong Google Play Console; phần An toàn dữ liệu phải khớp tính năng thực tế.
- Mobile đã có liên kết ở màn đăng nhập và tab Khác. URL trong `apps/mobile/eas.json`;
  Metro local dùng `EXPO_PUBLIC_PRIVACY_POLICY_URL` trong `.env.local` theo `.env.example`.
- Build mobile mới để đưa liên kết vào bản cài. Những lần chỉ sửa nội dung trang chính sách sau đó chỉ cần deploy web.
