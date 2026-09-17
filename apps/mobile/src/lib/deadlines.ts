import type { Deadline, DeadlineKind, StockCheckType } from "@/types";

export const stockCheckTypeLabel: Record<StockCheckType, string> = {
  WEEKLY: "Phiếu tuần",
  MONTHLY: "Phiếu tháng",
};

export const deadlineKindLabel: Record<DeadlineKind, string> = {
  SALES_ORDER: "Đơn hàng",
  STOCK_CHECK_WEEKLY: "Phiếu kiểm tuần",
  STOCK_CHECK_MONTHLY: "Phiếu kiểm tháng",
};

/** 1 = Thứ 2 … 7 = Chủ nhật (ISO-8601), khớp với cột `weekday` phía server. */
export const WEEKDAYS = [
  { value: 1, label: "Thứ 2" },
  { value: 2, label: "Thứ 3" },
  { value: 3, label: "Thứ 4" },
  { value: 4, label: "Thứ 5" },
  { value: 5, label: "Thứ 6" },
  { value: 6, label: "Thứ 7" },
  { value: 7, label: "Chủ nhật" },
];

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Diễn giải một dòng lịch thành câu tiếng Việt. Dùng làm dòng xem trước ngay dưới form cấu hình
 * để admin đặt xong nhìn phát biết hạn rơi vào lúc nào, khỏi phải tự nhẩm từ mấy ô rời rạc.
 */
export function describeDeadline(
  rule: Pick<Deadline, "kind" | "weekday" | "periodWeekday" | "graceDays" | "hour" | "minute">,
): string {
  const time = formatTime(rule.hour, rule.minute);

  if (rule.kind === "SALES_ORDER") {
    return `Đơn tạo sau ${time} mỗi ngày sẽ bị đánh dấu muộn.`;
  }

  if (rule.kind === "STOCK_CHECK_WEEKLY") {
    const dueDay = WEEKDAYS.find((d) => d.value === rule.weekday)?.label;
    const checkDay = WEEKDAYS.find((d) => d.value === rule.periodWeekday)?.label;
    if (!dueDay || !checkDay) return "Chưa chọn đủ thứ — phiếu tuần sẽ không được đánh giá.";
    if (rule.weekday === rule.periodWeekday) {
      return `Kiểm ${checkDay}, phải nộp ngay trong ngày trước ${time}.`;
    }
    // Nói rõ "kể từ ngày kiểm" vì hạn có thể rơi sang tuần lịch kế tiếp (vd kiểm Chủ nhật, hạn Thứ 2).
    const gap = ((rule.weekday! - rule.periodWeekday! + 7) % 7) as number;
    return `Kiểm ${checkDay}, phải nộp trước ${time} ${dueDay} ngay sau đó (${gap} ngày sau ngày kiểm).`;
  }

  if (rule.graceDays === 0) {
    return `Phiếu tháng phải nộp trước ${time} ngày cuối tháng — tức trước khi tháng kết thúc.`;
  }
  const suffix = rule.graceDays === 1 ? "ngày mùng 1 tháng sau" : `${rule.graceDays} ngày sau khi hết tháng`;
  return `Phiếu tháng phải nộp trước ${time} ${suffix}.`;
}
