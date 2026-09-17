/** Chỉ lấy mã lỗi, không hiển thị/log toàn bộ phản hồi có thể chứa dữ liệu đăng nhập. */
export function googleSignInErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = String(error.code);
  return /^[A-Za-z0-9_-]{1,80}$/.test(code) ? code : undefined;
}

export function googleSignInErrorMessage(error: unknown): string {
  const code = googleSignInErrorCode(error);
  if (code === "10" || code === "DEVELOPER_ERROR") {
    return `Cấu hình đăng nhập Google chưa khớp (mã ${code}). Kiểm tra Client ID Android cùng project với Client ID Web, package và SHA-1 của bản app đang cài.`;
  }
  if (code === "7" || code === "NETWORK_ERROR") {
    return `Không kết nối được Google (mã ${code}). Vui lòng kiểm tra mạng rồi thử lại.`;
  }
  return code
    ? `Không đăng nhập được Google (mã ${code}). Vui lòng gửi mã lỗi này để kiểm tra.`
    : "Không đăng nhập được Google (không có mã lỗi). Vui lòng thử lại.";
}
