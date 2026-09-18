import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/privacy/PrivacyPolicy";
import { privacyPolicy, privacyPolicyIsDraft } from "@/lib/privacyPolicy";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư | Quản lý kho",
  description: "Thông tin về dữ liệu, quyền trên thiết bị, lưu giữ và yêu cầu xoá dữ liệu của ứng dụng Quản lý kho.",
  robots: privacyPolicyIsDraft ? { index: false, follow: false } : { index: true, follow: true },
};

// Trang công khai, ngoài nhóm (app), không gọi API hay kiểm tra phiên đăng nhập.
export default function PrivacyPolicyPage() {
  return (
    <PrivacyPolicy
      {...privacyPolicy}
      draft={privacyPolicyIsDraft}
      retention={
        <>
          <p>
            Thông tin tài khoản, dữ liệu nghiệp vụ và ảnh chứng từ được lưu để duy trì tài khoản,
            phục vụ quản lý kho, đối chiếu nghiệp vụ và hỗ trợ người dùng trong thời gian sử dụng dịch vụ.
            Bạn có thể gửi yêu cầu xoá tài khoản hoặc dữ liệu theo hướng dẫn ở mục 8.
          </p>
          <p>
            Chúng tôi cam kết hoàn tất xoá dữ liệu trong vòng 30 ngày kể từ khi nhận được yêu cầu
            xoá hợp lệ. Đây là thời hạn xử lý yêu cầu, không phải thời hạn tự động xoá mọi dữ liệu
            sau 30 ngày sử dụng ứng dụng.
          </p>
        </>
      }
      deletion={
        <>
          <p>
            Để yêu cầu xoá tài khoản và dữ liệu liên quan, hoặc chỉ xoá một phần thông tin,
            hãy gửi email tới địa chỉ trên và nêu rõ phạm vi cần xoá. Chúng tôi có thể yêu cầu
            thông tin cần thiết để xác minh bạn là chủ tài khoản hoặc có quyền đối với dữ liệu đó.
          </p>
          <p>
            Trương Thái tiếp nhận và xử lý yêu cầu qua email, cam kết hoàn tất xoá dữ liệu trong
            vòng 30 ngày kể từ khi nhận được yêu cầu xoá hợp lệ và thông báo kết quả qua email.
            Bạn không cần đăng nhập ứng dụng để gửi yêu cầu.
          </p>
        </>
      }
    />
  );
}
