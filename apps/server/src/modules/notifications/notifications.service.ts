import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { isZaloBotConfigured, sendZaloMessage } from "./zaloBot.client";

/** Liệt kê tối đa từng này dòng hàng trong tin nhắn, phần còn lại gộp thành "+N mặt hàng khác". */
const MAX_ITEM_LINES = 10;

// Server (Render) chạy giờ UTC; ép về giờ Việt Nam để tin nhắn không lệch 7 tiếng.
const partsFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Ghép tay từ formatToParts thay vì dùng thẳng chuỗi Intl trả về: locale vi-VN xếp giờ lên
 * trước ngày ("16:25 10/08/2026"), trong khi tin nhắn cần đọc theo thứ tự "ngày rồi giờ".
 */
function formatDateTime(date: Date): string {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Chỉ lấy đúng những trường cần cho tin nhắn, để không phải phụ thuộc vào kiểu trả về của Prisma. */
export interface NotifiableSalesOrder {
  id: string;
  code: string;
  orderDate: Date;
  note?: string | null;
  createdById?: string | null;
  warehouse?: { name: string } | null;
  createdBy?: { name: string; email: string } | null;
  items: { productId: string; quantity: unknown; product: { code: string; name: string; unit?: { name: string } | null } }[];
  /** Số lượng admin báo đã mua thực tế, tách theo từng NCC — cần cộng dồn lại theo hàng hoá. */
  stockExport?: { items: { productId: string; quantity: unknown }[] } | null;
}

function formatQuantity(quantity: unknown): string {
  // Prisma trả Decimal; Number() rồi bỏ số 0 thừa sau dấu phẩy ("5.000" -> "5").
  const n = Number(quantity);
  return Number.isFinite(n) ? String(n) : String(quantity);
}

export function buildNewOrderMessage(order: NotifiableSalesOrder): string {
  const lines = [
    "🛒 ĐƠN HÀNG MỚI",
    "",
    `Mã đơn: ${order.code}`,
    `Quán đặt: ${order.createdBy?.name ?? "Không rõ"}`,
    `Kho: ${order.warehouse?.name ?? "Không rõ"}`,
    `Ngày đặt: ${formatDateTime(order.orderDate)}`,
    `Số mặt hàng: ${order.items.length}`,
    "",
  ];

  for (const item of order.items.slice(0, MAX_ITEM_LINES)) {
    const unit = item.product.unit?.name ? ` ${item.product.unit.name}` : "";
    lines.push(`• ${item.product.code} — ${item.product.name}: ${formatQuantity(item.quantity)}${unit}`);
  }
  if (order.items.length > MAX_ITEM_LINES) {
    lines.push(`… và ${order.items.length - MAX_ITEM_LINES} mặt hàng khác`);
  }

  if (order.note?.trim()) {
    lines.push("", `Ghi chú: ${order.note.trim()}`);
  }

  lines.push("", `Xem chi tiết: ${env.webOrigin}/orders/${order.id}`);
  return lines.join("\n");
}

export function buildPendingConfirmMessage(order: NotifiableSalesOrder): string {
  // Số lượng admin báo mua thực tế nằm ở phiếu xuất kho, có thể tách nhiều dòng cho cùng một
  // hàng hoá (mua từ nhiều NCC) — phải cộng dồn lại mới so được với số đã đặt.
  const reportedByProductId = new Map<string, number>();
  for (const line of order.stockExport?.items ?? []) {
    reportedByProductId.set(line.productId, (reportedByProductId.get(line.productId) ?? 0) + Number(line.quantity));
  }

  const lines = [
    "📋 ĐƠN HÀNG CHỜ XÁC NHẬN",
    "",
    `Mã đơn: ${order.code}`,
    `Kho: ${order.warehouse?.name ?? "Không rõ"}`,
    "",
    "Quản trị viên đã báo số lượng mua thực tế. Vui lòng kiểm tra và xác nhận:",
    "",
  ];

  // Dòng đúng bằng số đặt thì không cần nhắc; chỉ nêu những dòng LỆCH, vì đó mới là thứ quán
  // phải cân nhắc trước khi bấm xác nhận.
  const changed = order.items.filter((it) => (reportedByProductId.get(it.productId) ?? 0) !== Number(it.quantity));

  if (changed.length === 0) {
    lines.push(`Tất cả ${order.items.length} mặt hàng đều đúng số lượng đã đặt.`);
  } else {
    lines.push(`Có ${changed.length}/${order.items.length} mặt hàng lệch so với số đã đặt:`);
    for (const item of changed.slice(0, MAX_ITEM_LINES)) {
      const unit = item.product.unit?.name ? ` ${item.product.unit.name}` : "";
      const ordered = formatQuantity(item.quantity);
      const reported = formatQuantity(reportedByProductId.get(item.productId) ?? 0);
      lines.push(`• ${item.product.name}: đặt ${ordered}${unit} → mua ${reported}${unit}`);
    }
    if (changed.length > MAX_ITEM_LINES) {
      lines.push(`… và ${changed.length - MAX_ITEM_LINES} mặt hàng khác`);
    }
  }

  lines.push("", `Xác nhận tại: ${env.webOrigin}/orders/${order.id}`);
  return lines.join("\n");
}

interface Recipient {
  name: string;
  zaloChatId: string | null;
}

/**
 * Gửi `text` cho từng người nhận và trả về true nếu có ÍT NHẤT một người nhận được.
 *
 * Gửi song song để một người lỗi không chặn những người còn lại; lỗi của từng người chỉ ghi log
 * chứ không ném lên, vì phía gọi luôn là "việc chính đã xong rồi, thông báo là phần thêm".
 */
async function sendToRecipients(recipients: Recipient[], text: string, orderCode: string): Promise<boolean> {
  const results = await Promise.allSettled(recipients.map((r) => sendZaloMessage(r.zaloChatId as string, text)));

  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[zalo] Không gửi được thông báo đơn ${orderCode} cho ${recipients[i].name}:`, result.reason);
    }
  });

  return results.some((r) => r.status === "fulfilled");
}

/**
 * Gửi thông báo đơn mới cho mọi admin đã khai báo zaloChatId.
 *
 * KHÔNG BAO GIỜ ném lỗi: được gọi ngay sau khi đơn hàng đã lưu thành công, nên một sự cố phía
 * Zalo (mạng lỗi, token sai, hết hạn mức) tuyệt đối không được làm hỏng việc đặt hàng.
 *
 * Đổi lại, lỗi bị nuốt thì thông báo trượt sẽ mất hẳn — nên chỉ khi gửi được cho ít nhất một
 * admin ta mới đóng dấu `SalesOrder.notifiedAt`. Đơn có notifiedAt = null là đơn cần rà lại.
 */
export async function notifyNewSalesOrder(order: NotifiableSalesOrder): Promise<void> {
  try {
    if (!isZaloBotConfigured()) return;

    const recipients = await prisma.user.findMany({
      where: { role: "ADMIN", zaloChatId: { not: null } },
      select: { name: true, zaloChatId: true },
    });
    if (recipients.length === 0) return;

    if (await sendToRecipients(recipients, buildNewOrderMessage(order), order.code)) {
      await prisma.salesOrder.update({ where: { id: order.id }, data: { notifiedAt: new Date() } });
    }
  } catch (err) {
    console.error(`[zalo] Lỗi khi gửi thông báo đơn mới ${order.code}:`, err);
  }
}

/**
 * Báo cho ĐÚNG tài khoản quán đã đặt đơn khi admin xác nhận xong và đơn chuyển sang chờ xác nhận
 * — chỉ mình họ mới có quyền (và trách nhiệm) bấm xác nhận số lượng, nên không gửi rộng ra
 * những tài khoản khác. Cũng không bao giờ ném lỗi, xem notifyNewSalesOrder.
 */
export async function notifyOrderPendingConfirm(order: NotifiableSalesOrder): Promise<void> {
  try {
    if (!isZaloBotConfigured() || !order.createdById) return;

    const owner = await prisma.user.findUnique({
      where: { id: order.createdById },
      select: { name: true, zaloChatId: true },
    });
    if (!owner?.zaloChatId) return;

    if (await sendToRecipients([owner], buildPendingConfirmMessage(order), order.code)) {
      await prisma.salesOrder.update({ where: { id: order.id }, data: { pendingNotifiedAt: new Date() } });
    }
  } catch (err) {
    console.error(`[zalo] Lỗi khi gửi thông báo chờ xác nhận ${order.code}:`, err);
  }
}
