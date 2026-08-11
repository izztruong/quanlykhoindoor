import { env } from "../../config/env";

/**
 * Client cho Zalo Bot Platform — KHÁC hẳn Zalo OA:
 * - Token tĩnh, không hết hạn, không có refresh token xoay vòng, nên không cần bảng lưu token.
 * - Không có ràng buộc "chỉ được nhắn trong 48h" như tin tư vấn của OA.
 * - Bot KHÔNG thể nhắn trước cho người lạ: mỗi người nhận phải chủ động nhắn cho bot một lần
 *   để ta lấy được chatId của họ (xem getUpdates + trang cấu hình Zalo bên web).
 *
 * Bề mặt API mô phỏng Telegram Bot API: POST tới `<base>/bot<token>/<method>`, trả về
 * `{ ok: boolean, result?: ..., description?: ... }`.
 */
const BASE_URL = "https://bot-api.zapps.me";

/**
 * Không để treo request tạo đơn hàng khi Zalo chậm/không phản hồi. `fetch` mặc định không có
 * timeout nào cả, nên bắt buộc phải tự đặt.
 */
const TIMEOUT_MS = 5000;

/**
 * getUpdates là long polling nên cần hạn mức riêng, rộng hơn hẳn 5s của sendMessage.
 *
 * Đo thực tế: tham số `timeout` tính bằng GIÂY và NGƯỢC với Telegram — `timeout: 0` nghĩa là
 * chờ vô hạn (treo hẳn), chứ không phải "trả về ngay". Hết thời gian chờ mà không có tin nào
 * thì Zalo trả `error_code: 408`.
 *
 * Để hạn mức HTTP nhỉnh hơn `POLL_SECONDS` để Zalo kịp đóng bằng 408 (phân biệt được "không ai
 * nhắn" với "mạng hỏng"), thay vì mình tự huỷ kết nối trước.
 */
const POLL_SECONDS = 25;
const POLL_TIMEOUT_MS = (POLL_SECONDS + 5) * 1000;
const NO_UPDATES_ERROR_CODE = 408;

export function isZaloBotConfigured(): boolean {
  return env.zaloBotToken.length > 0;
}

export class ZaloBotError extends Error {
  /** `error_code` Zalo trả về, nếu có — dùng để phân biệt 408 "không ai nhắn" với lỗi thật. */
  errorCode?: number;

  constructor(message: string, errorCode?: number) {
    super(message);
    this.errorCode = errorCode;
  }
}

async function callZaloBot<T>(method: string, body: Record<string, unknown> = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  if (!isZaloBotConfigured()) {
    throw new ZaloBotError("Chưa cấu hình ZALO_BOT_TOKEN trên server");
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/bot${env.zaloBotToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // Gộp timeout (AbortError) và lỗi mạng về cùng một loại để phía gọi chỉ phải bắt ZaloBotError.
    const reason = err instanceof Error && err.name === "TimeoutError" ? `quá ${timeoutMs / 1000}s không phản hồi` : "không kết nối được";
    throw new ZaloBotError(`Gọi Zalo Bot API (${method}) thất bại: ${reason}`);
  }

  // Lỗi từ Zalo có thể trả về HTML/text chứ không chắc là JSON, nên đọc text rồi mới thử parse.
  const raw = await res.text();
  let payload: { ok?: boolean; result?: T; description?: string; error_code?: number };
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new ZaloBotError(`Zalo Bot API (${method}) trả về dữ liệu không hợp lệ (HTTP ${res.status})`);
  }

  // Lỗi nghiệp vụ của Zalo đi kèm HTTP 200 với `ok: false`, nên phải xét cả hai.
  if (!res.ok || payload.ok === false) {
    throw new ZaloBotError(payload.description ?? `Zalo Bot API (${method}) trả về HTTP ${res.status}`, payload.error_code);
  }

  return payload.result as T;
}

export interface ZaloBotInfo {
  id?: string;
  account_name?: string;
  display_name?: string;
}

/** Kiểm tra token có dùng được không — dùng cho nút "Kiểm tra kết nối" bên web. */
export function getZaloBotInfo() {
  return callZaloBot<ZaloBotInfo>("getMe");
}

export function sendZaloMessage(chatId: string, text: string) {
  return callZaloBot<unknown>("sendMessage", { chat_id: chatId, text });
}

export interface ZaloBotUpdate {
  event_name?: string;
  message?: {
    text?: string;
    message_id?: string;
    date?: number;
    chat?: { id?: string | number; chat_type?: string };
    from?: { id?: string | number; display_name?: string; is_bot?: boolean };
  };
}

/**
 * Chờ tin nhắn gửi tới bot, dùng một lần lúc cài đặt để lấy chatId của admin mà không phải mò
 * thủ công.
 *
 * QUAN TRỌNG: tin nhắn KHÔNG được xếp hàng chờ sẵn — đã kiểm chứng bằng cách nhắn cho bot rồi
 * mới gọi, vẫn trả về rỗng. Hàm chỉ bắt được tin đến TRONG LÚC đang chờ, nên quy trình bắt buộc
 * là bấm nút trước rồi mới nhắn cho bot.
 *
 * Lưu ý: getUpdates và webhook loại trừ nhau. Dự án này cố tình KHÔNG dùng webhook (server trên
 * Render ngủ sau 15 phút, webhook rất dễ timeout giữa lúc khởi động lạnh và Zalo không đảm bảo
 * gửi lại).
 */
export async function getZaloBotUpdates(): Promise<ZaloBotUpdate[]> {
  try {
    const result = await callZaloBot<ZaloBotUpdate | ZaloBotUpdate[]>("getUpdates", { timeout: POLL_SECONDS }, POLL_TIMEOUT_MS);
    // Khác Telegram: Zalo trả về MỘT update đơn lẻ chứ không phải mảng (đã kiểm chứng bằng
    // phản hồi thật). Vẫn nhận cả hai dạng phòng khi Zalo đổi, phía gọi luôn thấy mảng.
    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  } catch (err) {
    // Hết thời gian chờ mà không ai nhắn là kết quả bình thường, không phải sự cố.
    if (err instanceof ZaloBotError && err.errorCode === NO_UPDATES_ERROR_CODE) return [];
    throw err;
  }
}
