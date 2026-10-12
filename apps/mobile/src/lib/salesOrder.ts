import type { BadgeTone } from "@/components/ui/Badge";
import type { SalesOrderStatus } from "@/types";

/** Màu thẻ trạng thái đơn — giữ đúng bảng màu của bản web để hai bên nhìn giống nhau. */
export const SALES_ORDER_STATUS_TONE: Record<SalesOrderStatus, BadgeTone> = {
  DRAFT: "yellow",
  CANCELLED: "red",
};

export const SALES_ORDER_STATUS_OPTIONS: { value: SalesOrderStatus; label: string }[] = [
  { value: "DRAFT", label: "Đã đặt" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

/** Ô lọc "Đã xử lý" — server nhận `processed` dạng chuỗi "true"/"false", xem salesOrders.routes.ts. */
export const SALES_ORDER_PROCESSED_OPTIONS = [
  { value: "true", label: "Đã xử lý" },
  { value: "false", label: "Chưa xử lý" },
];
