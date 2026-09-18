# App quản lý kho

Expo SDK 57, React Native, giao diện tiếng Việt. Cài dependencies trong thư mục này bằng `npm install`.

## Ghi nhớ đăng nhập

Màn đăng nhập có ô **Ghi nhớ đăng nhập**, mặc định bật và nhớ lựa chọn của lần đăng nhập thành công gần nhất. Áp dụng cho cả email/mật khẩu và Google.

- Bật: mã phiên được lưu trong SecureStore để mở lại app không phải nhập lại, khi phiên vẫn còn hiệu lực trên server.
- Tắt: mã phiên chỉ giữ trong bộ nhớ của lần chạy hiện tại; khi app khởi động lại phải đăng nhập. Chuyển app xuống nền chưa chắc đã kết thúc tiến trình.
- Đăng xuất/phiên hết hiệu lực vẫn xoá mã phiên; không lưu mật khẩu hay Google ID token. Lựa chọn của ô ghi nhớ được giữ lại.

Kiểm tra trên điện thoại: đăng nhập với ô bật/tắt rồi tắt hẳn và mở lại app; thử cả Google, đăng xuất, phiên hết hạn và đăng nhập sai. Đã kiểm typecheck, bundle Android và logic bằng mô phỏng SecureStore/hooks; chưa thử chức năng này trên điện thoại.

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
- Check Cost: danh sách 20 phiếu/lượt, tạo theo hai phiếu kiểm kê của quán, xem doanh thu/8 chỉ tiêu chi phí/món đã bán/báo cáo nguyên liệu theo loại và nhóm; huỷ/bỏ huỷ có xác nhận. Menu và thao tác theo quyền `COST_CHECKS`. Không sửa, xoá hay nhập Excel.
- Quản trị: tài khoản và vai trò. Quyền được lấy từ catalog server; khoá thao tác với tài khoản/vai trò được bảo vệ và quyền người thao tác không nắm.

Menu đã bỏ phiếu kiểm kê kho, định lượng Order nhanh, bảng giá NCC, tổng hợp đặt NCC và hạn order/kiểm kê. Báo cáo Kiểm kê vẫn có. Mobile không xuất Excel.

Đăng xuất chuyển về màn đăng nhập ngay, chờ tác vụ gỡ push token/gọi server tối đa 3 giây rồi dọn phiên cũ. Yêu cầu gỡ push đã gửi vẫn tiếp tục chạy khi hết thời gian chờ; phản hồi muộn không xoá khoá push trên máy hoặc gọi logout bằng phiên mới. Phiên đăng nhập mới chờ dọn phiên cũ xong để không bị xoá nhầm. Đầu trang ưu tiên tên người dùng; ô chuông bán trong suốt, icon 20 và không có bóng đổ.

Đã sửa đăng nhập lại báo thành công nhưng kẹt ở màn đăng nhập: dọn dữ liệu phiên cũ vẫn giữ query xác thực mà màn điều hướng đang theo dõi. Áp dụng cả sau đổi mật khẩu; huỷ truy vấn `/auth/me` cũ trước khi cập nhật phiên mới. Đăng nhập email/Google không hiện toast “Thành công” trước khi lưu phiên xong.

## Kiểm tra

```powershell
npm run typecheck
npx expo export --platform android
```

Đã kiểm TypeScript, bundle Android và các trường hợp quyền, điều kiện gọi báo cáo, phân trang, giữ nguyên lượng tịnh khi sửa phiếu bằng script. Chưa thao tác các màn mới trên điện thoại.
Đợt Check Cost: typecheck và bundle Android đã qua; script kiểm dữ liệu tạo phiếu, số thập phân, 8 chỉ tiêu khớp web, nhóm báo cáo, ngưỡng màu, cập nhật cache; đăng xuất mất mạng/timeout, đăng nhập lại nhanh và phản hồi 401 cũ. Chưa thử đợt sửa này trên điện thoại.
Sửa tiếp luồng gỡ push: typecheck mobile/server và mô phỏng phản hồi nhanh/chậm hơn 3 giây, đăng nhập tài khoản mới, lỗi mạng/401 đều qua. Yêu cầu gỡ trên server vẫn chạy sau timeout, phản hồi muộn không xoá khoá push hay phiên mới trên máy. Chưa thử với Render đang ngủ trên điện thoại.

Cần kiểm trên development build:

1. Đăng nhập Google bằng Gmail đã có và chưa có tài khoản; huỷ chọn Google rồi đăng nhập bằng mật khẩu.
2. Mở đủ 5 báo cáo, áp dụng/huỷ bộ lọc, lọc mã phiếu, cuộn tải thêm và kéo làm tươi; Kiểm kê nhắc chọn kho trước khi tải.
3. Tạo nhập/xuất, đổi NCC sau khi thêm hàng, thử hàng thiếu giá NCC, đối chiếu tiền vốn với web.
4. Tạo/sửa điều chuyển, xác nhận SL lẻ không bị trừ vỏ lần nữa; sửa phiếu thuộc kỳ Check Cost và kiểm tra cảnh báo mã phiếu.
5. Tạo/sửa/xoá tài khoản, vai trò bằng admin; thử tài khoản quyền hẹp, tự đổi/xoá vai trò và bảo vệ admin cuối cùng.
6. Đăng xuất khi server hoạt động và khi tắt server: về đăng nhập ngay, không hiện toast lỗi; đăng nhập lại ngay và kiểm tra phiên mới vẫn còn sau hơn 3 giây. Thử server phản hồi chậm hơn 3 giây: yêu cầu gỡ push vẫn hoàn thành, không xoá khoá push của phiên mới; thử thông báo sau khi server hoàn tất gỡ token.
   Thử đăng nhập lại bằng mật khẩu/Google sau đăng xuất hoặc đổi mật khẩu: phải vào Trang chủ, dữ liệu tài khoản cũ không còn. Đã mô phỏng bằng QueryObserver/MutationObserver thật (kèm lưu phiên chậm/lỗi và `/auth/me` cũ trả muộn), chưa thử bản sửa trên điện thoại.
7. Trang chủ hiện tên (thiếu tên thì email); tab Khác vẫn hiện “Khác”; ô chuông trong hơn, không có bóng xám và vẫn đếm chưa đọc đúng.
8. Check Cost: tạo với hai phiếu kiểm và vài món, đối chiếu doanh thu/chi phí/nguyên liệu với cùng phiếu trên web; kéo làm tươi, cuộn tải thêm, huỷ/bỏ huỷ và kiểm tra danh sách/trang chủ cập nhật.
9. Thử quyền thiếu VIEW/ADD/EDIT; đổi quán phải xoá hai phiếu đã chọn; kiểm tra chọn trùng phiếu, thiếu SL, đầu kỳ sau cuối kỳ và lỗi server. Thử tạo phiếu trên DB local, dọn dữ liệu sau khi thử vì API không hỗ trợ xoá Check Cost.

## Build theo môi trường

`eas.json` đã ghi cứng API cho từng profile — không sửa tay trước khi build:

| Nhánh | Lệnh (trong `apps/mobile`) | App gọi tới |
|---|---|---|
| `dev` | `npx eas-cli build --profile development --platform android` (chỉ khi đổi native module) | server local qua Metro |
| `staging` | `npm run build:preview` → APK | staging |
| `main` | `npm run build:production` → AAB cho CH Play | production |

`build:preview` / `build:production` dừng ngay nếu đang sai nhánh hoặc còn file chưa commit. App bản thử
hiện nhãn `LOCAL` (vàng) hoặc `STAGING` (xanh) ở màn đăng nhập và đầu trang; bản production không có nhãn.
Development build đang tải Metro chỉ cần tải lại JavaScript. Nút Google trên bản preview cần
`GOOGLE_CLIENT_ID` đặt trên Render staging.

API cần bản server có `_count.items` ở danh sách điều chuyển để hiện số dòng; server cũ vẫn mở được danh sách nhưng hiện `—` cho số dòng.
