# App quản lý kho

Expo SDK 57, React Native, giao diện tiếng Việt. Cài dependencies trong thư mục này bằng `npm install`.

## Google Sign-In trên Android

Thư viện và plugin đã được cấu hình. Development build cũ cần build lại để có native module:

```powershell
cd "E:\Quản lý quán\apps\mobile"
eas build --profile development --platform android
```

Cài APK mới rồi chạy `npx expo start --dev-client`. Nếu Metro đang mở từ trước khi thêm các màn mới hoặc thay đổi env, khởi động lại Metro.

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` phải là OAuth client **Web**, trùng `GOOGLE_CLIENT_ID` của server. Development profile trong `eas.json` đã có giá trị này. Khi chạy Metro trên máy khác, đặt cùng giá trị trong `.env.local` (xem `.env.example`); EAS env không tự truyền vào Metro local.
- Google Cloud Console cần OAuth client **Android** cho package `com.quanlykho.app` và SHA-1 của đúng keystore. Xem fingerprint bằng `eas credentials`. Các keystore khác nhau cần khai fingerprint tương ứng.
- Nếu quản lý OAuth qua Firebase, tải lại `google-services.json` sau khi bổ sung client Android. File hiện có trong dự án chưa có OAuth client.
- Chỉ tài khoản đã tồn tại trên hệ thống và có email khớp mới đăng nhập được. Không cấu hình client Web thì app ẩn nút Google.
- Preview/production cần đặt cùng biến công khai và `EXPO_PUBLIC_API_URL` trỏ đúng API trong môi trường EAS tương ứng; development client tải JavaScript từ Metro, còn preview/production đóng gói JavaScript lúc build.

Google Sign-In dùng native code và cần development build; [hướng dẫn của thư viện](https://react-native-google-signin.github.io/docs/setting-up/expo). Phần cấu hình hiện tại phục vụ Android; iOS cần OAuth client và cấu hình Google dành riêng cho iOS trước khi kiểm thử.

## Các màn bổ sung

- Báo cáo kiểm toán: tổng hợp nhập/xuất, chi tiết nhập/xuất, kiểm kê. Báo cáo Kiểm kê yêu cầu chọn kho; bốn báo cáo còn lại tải 20 dòng mỗi lần cuộn.
- Nhập/xuất kho: danh sách, tạo phiếu, chi tiết. Nhập chọn NCC trên phiếu, xuất chọn theo dòng; giá tự điền từ bảng giá NCC. Không có sửa/xoá vì API không hỗ trợ.
- Điều chuyển: danh sách, tạo, chi tiết, sửa; cảnh báo Check Cost bị ảnh hưởng sau khi lưu. Khi sửa, ô SL lẻ được đổi lại về cân cả vỏ để tránh trừ vỏ hai lần.
- Quản trị: tài khoản và vai trò. Quyền được lấy từ catalog server; khoá thao tác với tài khoản/vai trò được bảo vệ và quyền người thao tác không nắm.

Menu đã bỏ Check Cost, phiếu kiểm kê kho, định lượng Order nhanh, bảng giá NCC, tổng hợp đặt NCC và hạn order/kiểm kê. Báo cáo Kiểm kê vẫn có. Mobile không xuất Excel.

## Kiểm tra

```powershell
npm run typecheck
npx expo export --platform android
```

Đã kiểm TypeScript, bundle Android và các trường hợp quyền, điều kiện gọi báo cáo, phân trang, giữ nguyên lượng tịnh khi sửa phiếu bằng script. Chưa thao tác các màn mới trên điện thoại.

Cần kiểm trên development build:

1. Đăng nhập Google bằng Gmail đã có và chưa có tài khoản; huỷ chọn Google rồi đăng nhập bằng mật khẩu.
2. Mở đủ 5 báo cáo, áp dụng/huỷ bộ lọc, lọc mã phiếu, cuộn tải thêm và kéo làm tươi; Kiểm kê nhắc chọn kho trước khi tải.
3. Tạo nhập/xuất, đổi NCC sau khi thêm hàng, thử hàng thiếu giá NCC, đối chiếu tiền vốn với web.
4. Tạo/sửa điều chuyển, xác nhận SL lẻ không bị trừ vỏ lần nữa; sửa phiếu thuộc kỳ Check Cost và kiểm tra cảnh báo mã phiếu.
5. Tạo/sửa/xoá tài khoản, vai trò bằng admin; thử tài khoản quyền hẹp, tự đổi/xoá vai trò và bảo vệ admin cuối cùng.

API cần bản server có `_count.items` ở danh sách điều chuyển để hiện số dòng; server cũ vẫn mở được danh sách nhưng hiện `—` cho số dòng.
