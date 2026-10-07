import type { BadgeTone } from "@/components/ui/Badge";
import type { SalesOrderStatus } from "@/types";

/** Màu thẻ trạng thái đơn — giữ đúng bảng màu của bản web để hai bên nhìn giống nhau. */
export const SALES_ORDER_STATUS_TONE: Record<SalesOrderStatus, BadgeTone> = {
  DRAFT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

export const SALES_ORDER_STATUS_OPTIONS: { value: SalesOrderStatus; label: string }[] = [
  { value: "DRAFT", label: "Chưa xử lý" },
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "CANCELLED", label: "Đã huỷ" },
];
