import type { OrderCadence } from "../generated/prisma/client";
import { vnCalendar } from "./deadlines";

/** Số ngày của một tháng theo lịch VN. Ngày 0 của tháng kế tiếp chính là ngày cuối tháng này. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Hai mốc gọi đồ trong tháng cho hàng CÓ CÔNG NỢ: ngày **15** và ngày **30**.
 *
 * Tháng nào không có ngày 30 (tháng 2) thì lùi về ngày cuối tháng — nếu không, tháng đó sẽ chỉ còn một
 * mốc gọi và quán hụt hàng nửa cuối tháng.
 */
function creditOrderDays(year: number, month: number): number[] {
  return [15, Math.min(30, daysInMonth(year, month))];
}

/**
 * Số ngày từ hôm nay tới MỐC GỌI CÔNG NỢ kế tiếp.
 *
 * Hôm nay LÀ mốc gọi thì trả về mốc sau, không phải 0: đơn đặt hôm nay phải phủ tới lúc lô sau về.
 *
 * Ví dụ với mốc {15, 30}: ngày 10 → 5 · ngày 15 → 15 · ngày 20 → 10 · ngày 30 → 15 (tới ngày 15 tháng
 * sau). Tháng 2 có 28 ngày thì mốc là {15, 28}: ngày 20 → 8.
 */
export function daysUntilNextCreditOrder(now: Date): number {
  const { year, month, day } = vnCalendar(now);
  const next = creditOrderDays(year, month).find((d) => d > day);
  if (next != null) return next - day;
  // Đã qua mốc cuối của tháng này → mốc kế tiếp là ngày 15 tháng sau.
  return daysInMonth(year, month) - day + 15;
}

/**
 * Nhịp gọi thực tế của một hàng hoá.
 *
 * Khai tay trên `Product.orderCadence` thì dùng luôn. Để trống thì **suy từ công nợ**: NCC ưu tiên có
 * cho công nợ mặt hàng này thì gọi 2 lần/tháng, không thì gọi liên tục theo số ngày phủ.
 *
 * Suy như vậy vì đó đúng là cách người dùng nghĩ ("đồ công nợ gọi 2 lần/tháng, đồ trả ngay gọi liên
 * tục") — bắt khai lại từng hàng hoá là chép lại một thông tin đã có trong bảng giá NCC, và hai chỗ sẽ
 * lệch nhau ngay lần đầu ai đó đổi NCC.
 */
export function resolveCadence(explicit: OrderCadence | null, priorityHasCredit: boolean): OrderCadence {
  if (explicit) return explicit;
  return priorityHasCredit ? "CREDIT_TWICE_MONTHLY" : "BY_COVER_DAYS";
}

export interface SupplierPriceLike {
  supplierId: string;
  priority: number;
  importPrice: unknown;
  hasCredit: boolean;
  supplierName: string;
}

/**
 * NCC ưu tiên cho một mặt hàng: `priority` nhỏ nhất → giá nhập rẻ hơn → tên NCC.
 *
 * **Phải giống hệt cách chọn của `getPurchaseSummary`** ([reports.service.ts]) — nếu hai chỗ chọn khác
 * nhau thì nhịp gọi suy theo một NCC còn đơn lại đặt cho NCC khác, và không ai hiểu vì sao lệch.
 * Tiêu chí thứ ba là tên NCC để kết quả không đổi giữa các lần chạy khi hai NCC hoà cả hai tiêu chí đầu.
 */
export function pickPrioritySupplier<T extends SupplierPriceLike>(prices: T[]): T | null {
  let best: T | null = null;
  for (const price of prices) {
    if (
      !best ||
      price.priority < best.priority ||
      (price.priority === best.priority && Number(price.importPrice) < Number(best.importPrice)) ||
      (price.priority === best.priority &&
        Number(price.importPrice) === Number(best.importPrice) &&
        price.supplierName.localeCompare(best.supplierName) < 0)
    ) {
      best = price;
    }
  }
  return best;
}

/** Số ngày phủ mặc định khi không khai ở đâu cả. */
export const DEFAULT_COVER_DAYS = 3;
