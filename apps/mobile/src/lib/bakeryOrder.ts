import type { BadgeTone } from "@/components/ui/Badge";
import type { BakeryOrderStatus } from "@/types";

/** Nhãn và màu trạng thái đơn bánh — giữ đúng bản web (lib/format.ts + BakeryOrderStatusBadge). */
export const BAKERY_ORDER_STATUS_LABEL: Record<BakeryOrderStatus, string> = {
  ORDERED: "Chờ tiệm bánh xác nhận",
  CONFIRMED: "Chờ vận chuyển lấy",
  IN_TRANSIT: "Đang giao",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

export const BAKERY_ORDER_STATUS_TONE: Record<BakeryOrderStatus, BadgeTone> = {
  ORDERED: "yellow",
  CONFIRMED: "blue",
  IN_TRANSIT: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export const BAKERY_ORDER_STATUS_OPTIONS = (Object.keys(BAKERY_ORDER_STATUS_LABEL) as BakeryOrderStatus[]).map((value) => ({
  value,
  label: BAKERY_ORDER_STATUS_LABEL[value],
}));

/** Số lượng gõ tay: nhận cả dấu phẩy thập phân. Rỗng = NaN để nơi gọi báo lỗi. */
export function parseQty(value: string): number {
  return value.trim() === "" ? NaN : Number(value.replace(",", "."));
}
