import type { BadgeTone } from "@/components/ui/Badge";
import type { SalesOrderStatus } from "@/types";

/** Màu thẻ trạng thái đơn — giữ đúng bảng màu của bản web để hai bên nhìn giống nhau. */
export const SALES_ORDER_STATUS_TONE: Record<SalesOrderStatus, BadgeTone> = {
  DRAFT: "gray",
  PENDING_CONFIRM: "yellow",
  CONFIRMED: "blue",
  SHORT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

export const SALES_ORDER_STATUS_OPTIONS: { value: SalesOrderStatus; label: string }[] = [
  { value: "DRAFT", label: "Chưa xác nhận" },
  { value: "PENDING_CONFIRM", label: "Chờ xác nhận" },
  { value: "CONFIRMED", label: "Đã xác nhận" },
  { value: "SHORT", label: "Thiếu" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Đã huỷ" },
];
