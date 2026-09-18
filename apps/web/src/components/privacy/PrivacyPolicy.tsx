import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

interface PrivacyPolicyProps {
  draft: boolean;
  operatorName: string;
  contactEmail: string;
  updatedAt: string;
  retention: ReactNode;
  deletion: ReactNode;
}

const contents = [
  ["pham-vi", "Phạm vi áp dụng"],
  ["du-lieu", "Dữ liệu được xử lý"],
  ["muc-dich", "Mục đích sử dụng"],
  ["quyen-thiet-bi", "Quyền trên thiết bị"],
  ["dich-vu", "Bên được tiếp cận dữ liệu"],
  ["bao-ve", "Bảo vệ dữ liệu"],
  ["luu-tru", "Lưu giữ dữ liệu"],
  ["yeu-cau-xoa", "Quyền và yêu cầu xoá dữ liệu"],
  ["cap-nhat", "Cập nhật chính sách"],
  ["lien-he", "Liên hệ"],
] as const;

export function PrivacyPolicy({ draft, operatorName, contactEmail, updatedAt, retention, deletion }: PrivacyPolicyProps) {
  const contactHref = `mailto:${contactEmail}?subject=${encodeURIComponent("Yêu cầu quyền riêng tư - Quản lý kho")}`;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-700 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/login" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-indigo-700 hover:underline">
          <ArrowLeft size={16} aria-hidden="true" /> Quản lý kho
        </Link>
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-indigo-50 px-6 py-8 sm:px-10">
            <ShieldCheck size={32} className="mb-4 text-indigo-600" aria-hidden="true" />
            <p className="mb-2 text-sm font-medium text-indigo-700">Quản lý kho{operatorName ? ` · ${operatorName}` : ""}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Chính sách quyền riêng tư</h1>
            <p className="mt-4 text-sm text-slate-600">Cập nhật lần cuối: {updatedAt}</p>
            <p className="mt-5 leading-7">
              Chính sách này giải thích dữ liệu được xử lý khi bạn sử dụng ứng dụng Quản lý kho và website
              đi kèm, mục đích sử dụng dữ liệu và cách liên hệ về quyền riêng tư.
            </p>
          </header>

          {draft ? (
            <div role="note" className="border-b border-amber-200 bg-amber-50 px-6 py-5 text-sm leading-6 text-amber-900 sm:px-10">
              <strong>Bản nháp — chưa dùng để nộp Google Play.</strong> Thông tin đơn vị vận hành, email
              tiếp nhận yêu cầu và quy trình lưu/xoá dữ liệu cần được hoàn thiện, xác nhận trước khi công bố.
            </div>
          ) : null}

          <nav aria-label="Mục lục chính sách quyền riêng tư" className="border-b border-slate-200 px-6 py-6 sm:px-10">
            <p className="mb-3 font-semibold text-slate-900">Nội dung</p>
            <ol className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {contents.map(([id, title], index) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-block py-1 text-indigo-700 underline-offset-4 hover:underline">
                    {index + 1}. {title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-9 px-6 py-8 leading-7 sm:px-10">
            <Section id="pham-vi" title="1. Phạm vi áp dụng">
              <p>
                Ứng dụng Quản lý kho{operatorName ? ` do ${operatorName} vận hành` : ""}, phục vụ quản lý kho, đơn hàng, kiểm kê,
                Check Cost và các nghiệp vụ thu chi của quán. Tài khoản được người có quyền quản trị cấp
                và phân quyền. Đăng nhập Google chỉ xác thực email để truy cập tài khoản đã được cấp,
                không tự tạo tài khoản mới.
              </p>
            </Section>

            <Section id="du-lieu" title="2. Dữ liệu được xử lý">
              <ul className="list-disc space-y-3 pl-5">
                <li><strong>Tài khoản:</strong> tên, email, mã tài khoản, vai trò, quyền truy cập và thông tin xác thực.
                  Với đăng nhập bằng mật khẩu, hệ thống lưu giá trị băm của mật khẩu. Khi bạn chọn đăng nhập Google,
                  hệ thống nhận mã xác thực và kiểm tra email đã xác minh; không nhận mật khẩu Google của bạn.</li>
                <li><strong>Dữ liệu nghiệp vụ:</strong> đơn hàng, nhập/xuất kho, kiểm kê, phiếu huỷ và điều chuyển,
                  Check Cost, đề xuất chi, thu chi, ghi chú, người lập/người xử lý và thời điểm thao tác.
                  Dữ liệu danh mục có thể gồm tên, số điện thoại và địa chỉ khách hàng, nhà cung cấp do người dùng nhập.</li>
                <li><strong>Ảnh chứng từ:</strong> ảnh bạn chủ động chụp hoặc chọn và gửi kèm nghiệp vụ.
                  Ứng dụng xử lý ảnh để giảm dung lượng trước khi tải lên.</li>
                <li><strong>Thông báo:</strong> mã token nhận thông báo của bản app trên thiết bị, nền tảng thiết bị,
                  nội dung thông báo, trạng thái đã đọc và lựa chọn loại thông báo.</li>
                <li><strong>Dữ liệu phiên và kỹ thuật:</strong> mã phiên đăng nhập, lựa chọn ghi nhớ đăng nhập;
                  địa chỉ IP và thông tin yêu cầu được hệ thống/hạ tầng xử lý để phục vụ kết nối,
                  giới hạn đăng nhập và chẩn đoán lỗi.</li>
              </ul>
            </Section>

            <Section id="muc-dich" title="3. Mục đích sử dụng">
              <p>
                Dữ liệu được dùng để xác thực và phân quyền tài khoản; lưu, xử lý và đối chiếu nghiệp vụ;
                lập báo cáo; hiển thị ảnh chứng từ; gửi thông báo liên quan đến đơn hàng/đề xuất chi;
                hỗ trợ người dùng và bảo vệ hoạt động của hệ thống.
              </p>
              <p>
                Cookie phiên trên web và mã phiên trên điện thoại giúp duy trì đăng nhập.
                Khi bật Ghi nhớ đăng nhập, mã phiên được lưu trong vùng lưu trữ bảo mật của hệ điều hành;
                khi tắt, mã phiên chỉ được giữ trong lần chạy hiện tại. Ứng dụng không lưu mật khẩu
                trong tính năng Ghi nhớ đăng nhập.
              </p>
            </Section>

            <Section id="quyen-thiet-bi" title="4. Quyền trên thiết bị">
              <ul className="list-disc space-y-2 pl-5">
                <li><strong>Camera:</strong> chụp ảnh chứng từ khi bạn chọn chức năng chụp ảnh.</li>
                <li><strong>Ảnh/thư viện:</strong> chọn ảnh chứng từ khi bạn sử dụng chức năng đính kèm;
                  chỉ những ảnh bạn chọn và gửi mới được tải lên hệ thống.</li>
                <li><strong>Thông báo:</strong> hiển thị thông báo nghiệp vụ trên thiết bị.</li>
              </ul>
              <p>
                Bạn có thể từ chối hoặc thu hồi các quyền này trong Cài đặt của thiết bị.
                Việc từ chối sẽ ảnh hưởng đến tính năng tương ứng. Bạn cũng có thể bật/tắt từng loại
                thông báo trong phần Cài đặt thông báo của app.
              </p>
            </Section>

            <Section id="dich-vu" title="5. Bên được tiếp cận dữ liệu">
              <p>
                Người dùng và quản trị viên được cấp quyền trong cùng hệ thống có thể xem hoặc xử lý
                dữ liệu phù hợp với vai trò và phạm vi được phân công. Các nhà cung cấp sau tham gia
                xử lý dữ liệu để cung cấp dịch vụ:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li><strong>Google:</strong> xác thực khi bạn chọn đăng nhập bằng Google.</li>
                <li><strong>Expo và Firebase Cloud Messaging của Google:</strong> xử lý token và chuyển
                  nội dung thông báo đến thiết bị Android. Thông báo có thể hiện trên màn hình khoá theo cài đặt của bạn.</li>
                <li><strong>Vercel, Render và Neon:</strong> phục vụ website, máy chủ ứng dụng và cơ sở dữ liệu.</li>
                <li><strong>Cloudflare R2:</strong> lưu và cung cấp ảnh chứng từ khi bạn sử dụng tính năng đính kèm ảnh.</li>
              </ul>
              <p>
                Dữ liệu có thể được xử lý tại các quốc gia nơi nhà cung cấp đặt hạ tầng.
                Chính sách của nhà cung cấp có thể được xem tại{" "}
                <ExternalLink href="https://policies.google.com/privacy">Google</ExternalLink>,{" "}
                <ExternalLink href="https://expo.dev/privacy">Expo</ExternalLink>,{" "}
                <ExternalLink href="https://vercel.com/legal/privacy-notice">Vercel</ExternalLink>,{" "}
                <ExternalLink href="https://render.com/privacy">Render</ExternalLink>,{" "}
                <ExternalLink href="https://neon.com/privacy-policy">Neon</ExternalLink> và{" "}
                <ExternalLink href="https://www.cloudflare.com/privacypolicy/">Cloudflare</ExternalLink>.
              </p>
            </Section>

            <Section id="bao-ve" title="6. Bảo vệ dữ liệu">
              <p>
                Kết nối tới dịch vụ trực tuyến sử dụng HTTPS. Quyền xem và xử lý dữ liệu được kiểm tra
                tại máy chủ. Mật khẩu tài khoản được băm; mã phiên mobile được lưu bằng cơ chế bảo mật
                của hệ điều hành khi bạn chọn ghi nhớ đăng nhập. Ảnh chứng từ được cung cấp bằng liên kết
                có thời hạn sau khi kiểm tra quyền truy cập.
              </p>
              <p>
                Bạn nên bảo vệ thiết bị, giữ kín thông tin đăng nhập và chỉ nhập hoặc tải lên dữ liệu
                cần thiết mà bạn có quyền sử dụng. Nếu nghi ngờ truy cập trái phép, hãy liên hệ địa chỉ
                ở cuối chính sách này.
              </p>
            </Section>

            <Section id="luu-tru" title="7. Lưu giữ dữ liệu">{retention}</Section>

            <Section id="yeu-cau-xoa" title="8. Quyền và yêu cầu xoá dữ liệu">
              <p>
                Bạn có thể xem thông tin tài khoản, đổi email/mật khẩu trong app và điều chỉnh quyền
                trên thiết bị. Với yêu cầu truy cập, sửa hoặc xoá dữ liệu, hãy liên hệ quản trị viên
                đã cấp tài khoản{contactEmail ? " hoặc gửi email tới " : "."}
                {contactEmail ? <><a className="break-all text-indigo-700 underline" href={contactHref}>{contactEmail}</a>.</> : null}
                {" "}Nêu tên ứng dụng Quản lý kho, email tài khoản và nội dung yêu cầu. Không gửi mật khẩu
                hoặc mã xác thực khi liên hệ.
              </p>
              {deletion}
              <p>Gỡ ứng dụng hoặc đăng xuất không đồng nghĩa với việc xoá tài khoản và dữ liệu đã lưu trên máy chủ.</p>
            </Section>

            <Section id="cap-nhat" title="9. Cập nhật chính sách">
              <p>
                Chính sách được cập nhật khi cách xử lý dữ liệu hoặc chức năng của dịch vụ thay đổi.
                Phiên bản hiện hành được đăng tại trang này cùng ngày cập nhật ở đầu trang.
              </p>
            </Section>

            <Section id="lien-he" title="10. Liên hệ">
              <p>Ứng dụng: <strong>Quản lý kho</strong>.</p>
              <p>Đơn vị/cá nhân vận hành: <strong>{operatorName || "Chưa cung cấp"}</strong>.</p>
              <p>Email quyền riêng tư: {contactEmail
                ? <a href={contactHref} className="break-all text-indigo-700 underline">{contactEmail}</a>
                : "Chưa cung cấp"}.</p>
            </Section>
          </div>
        </article>
      </div>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 space-y-3">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className="text-indigo-700 underline underline-offset-4">{children}</a>;
}
