import { prisma } from "../config/db";
import type { Deadline, DeadlineKind, StockCheckType } from "../generated/prisma/client";
import { HttpError } from "./httpError";

/**
 * Việt Nam là UTC+7 quanh năm, không có giờ mùa hè — nên cộng/trừ một hằng số là đủ và chính xác
 * tuyệt đối, không cần Intl. Mọi phép tính hạn đều phải làm theo giờ VN chứ không theo giờ máy
 * chủ: Render chạy UTC, để nguyên thì "hạn 22:00" sẽ thành 05:00 sáng hôm sau.
 */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

interface VnParts {
  year: number;
  month: number;
  day: number;
  /** 1 = Thứ 2 … 7 = Chủ nhật (ISO-8601), khớp với Deadline.weekday. */
  weekday: number;
}

/** Đọc lịch ngày–tháng–năm theo giờ VN của một mốc thời gian. */
function vnParts(date: Date): VnParts {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  const jsDay = shifted.getUTCDay(); // 0 = Chủ nhật
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: jsDay === 0 ? 7 : jsDay,
  };
}

/**
 * Dựng lại mốc thời gian thật từ lịch giờ VN. `day` được phép tràn (0, âm, hay lớn hơn số ngày
 * của tháng) — Date.UTC tự cuộn sang tháng/năm liền kề, nhờ đó "ngày cuối tháng + 1" hay "lùi về
 * thứ Hai đầu tuần" không cần xử lý riêng cho các trường hợp bắc cầu qua tháng.
 */
function vnInstant(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - VN_OFFSET_MS);
}

/** Số ngày của tháng, theo lịch VN. Ngày 0 của tháng kế tiếp chính là ngày cuối tháng này. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Hạn đặt hàng: mốc giờ trong CHÍNH NGÀY tạo đơn. Vì hạn lặp lại hằng ngày nên ranh giới ngày tự
 * đóng vai điểm bắt đầu — không cần cấu hình giờ mở cửa sổ.
 */
export function salesOrderDueAt(createdAt: Date, rule: Deadline): Date {
  const at = vnParts(createdAt);
  return vnInstant(at.year, at.month, at.day, rule.hour, rule.minute);
}

/**
 * Hạn nộp phiếu kiểm tuần, tính qua hai bước:
 *   1. Lùi từ ngày kiểm về `periodWeekday` gần nhất -> mốc MỞ KỲ.
 *   2. Tiến từ mốc đó tới `weekday` đầu tiên gặp được -> hạn nộp.
 *
 * Không dùng tuần lịch cố định (bắt đầu Thứ 2): với quy định kiểm Chủ nhật / hạn Thứ 2, Thứ 2
 * cùng tuần lịch nằm TRƯỚC ngày kiểm 6 ngày nên phiếu nào cũng muộn. Neo kỳ vào ngày kiểm quy
 * định thì mọi cặp (ngày kiểm, ngày hạn) đều ra đúng.
 *
 * Vẫn neo vào KỲ chứ không vào chính `checkedAt`, nên vẫn chặn được khai gian: mọi ngày trong
 * cùng một kỳ đều lùi về cùng một mốc mở kỳ, tức cùng một hạn.
 */
export function weeklyStockCheckDueAt(checkedAt: Date, rule: Deadline): Date | null {
  if (rule.weekday == null || rule.periodWeekday == null) return null;
  const at = vnParts(checkedAt);
  // `+ 7) % 7` để phép lùi/tiến vẫn đúng khi thứ đích nhỏ hơn thứ nguồn (bắc cầu qua tuần).
  const daysSincePeriodStart = (at.weekday - rule.periodWeekday + 7) % 7;
  const daysFromStartToDue = (rule.weekday - rule.periodWeekday + 7) % 7;
  return vnInstant(at.year, at.month, at.day - daysSincePeriodStart + daysFromStartToDue, rule.hour, rule.minute);
}

/** Hạn nộp phiếu kiểm tháng: ngày cuối THÁNG chứa ngày kiểm, cộng thêm số ngày ân hạn. */
export function monthlyStockCheckDueAt(checkedAt: Date, rule: Deadline): Date {
  const at = vnParts(checkedAt);
  const lastDay = daysInMonth(at.year, at.month);
  return vnInstant(at.year, at.month, lastDay + rule.graceDays, rule.hour, rule.minute);
}

/**
 * Đồng hồ máy người dùng lệch vài phút so với máy chủ là chuyện bình thường, nên chừa dung sai
 * thay vì so tuyệt đối. Vài phút thì không đủ để nhảy sang kỳ khác — thứ mà rào này cần chặn.
 */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * `checkedAt` quyết định phiếu thuộc kỳ nào, mà kỳ lại quyết định hạn nộp — nên khai ngày kiểm ở
 * tương lai là đẩy được phiếu sang kỳ sau và thoát chấm muộn. Chặn ở đây vừa bịt đường đó, vừa
 * loại bỏ dữ liệu vô nghĩa (phiếu khai kiểm vào ngày chưa xảy ra).
 *
 * Lưu ý: rào này KHÔNG chặn được việc bỏ hẳn một kỳ rồi dán nhãn phiếu sang kỳ kế tiếp — ngày
 * khai lúc đó hoàn toàn hợp lệ. Muốn bắt trường hợp ấy thì phải phát hiện kỳ thiếu, là việc khác.
 */
export function assertCheckedAtNotInFuture(checkedAt: Date, now = new Date()): void {
  if (checkedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new HttpError(400, "Thời gian kiểm không được ở tương lai");
  }
}

function getRule(kind: DeadlineKind) {
  return prisma.deadline.findUnique({ where: { kind } });
}

/** `dueAt` null = chưa cấu hình lịch cho loại này, hiển thị "chưa đánh giá" chứ không phải đúng hạn. */
export interface LatenessStamp {
  dueAt: Date | null;
  isLate: boolean;
}

const NOT_EVALUATED: LatenessStamp = { dueAt: null, isLate: false };

function stamp(dueAt: Date | null, submittedAt: Date): LatenessStamp {
  if (!dueAt) return NOT_EVALUATED;
  return { dueAt, isLate: submittedAt.getTime() > dueAt.getTime() };
}

export async function stampSalesOrderLateness(createdAt: Date): Promise<LatenessStamp> {
  const rule = await getRule("SALES_ORDER");
  return rule ? stamp(salesOrderDueAt(createdAt, rule), createdAt) : NOT_EVALUATED;
}

/**
 * `checkedAt` quyết định phiếu thuộc kỳ nào, `createdAt` quyết định nộp đúng hạn hay không —
 * hai vai trò tách bạch, xem chú thích trên model StockCheck.
 */
export async function stampStockCheckLateness(
  type: StockCheckType | null | undefined,
  checkedAt: Date,
  createdAt: Date,
): Promise<LatenessStamp> {
  if (!type) return NOT_EVALUATED;

  if (type === "WEEKLY") {
    const rule = await getRule("STOCK_CHECK_WEEKLY");
    return rule ? stamp(weeklyStockCheckDueAt(checkedAt, rule), createdAt) : NOT_EVALUATED;
  }

  const rule = await getRule("STOCK_CHECK_MONTHLY");
  return rule ? stamp(monthlyStockCheckDueAt(checkedAt, rule), createdAt) : NOT_EVALUATED;
}
