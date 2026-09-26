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
 * Chênh lệch giá tối đa còn đáng đánh đổi để lấy được công nợ.
 *
 * Công nợ 2 tháng trong khi hàng quay vòng ~15 ngày nghĩa là bán xong mới phải trả — hai tháng vốn miễn
 * phí. Vài phần trăm giá nhập rẻ hơn không bù lại được chỗ đó, nên khi giá gần nhau thì chọn NCC cho nợ.
 *
 * Để 3% vì đó là mức "gần như bằng nhau" mà vẫn chặn được việc chọn một NCC đắt hẳn. Đây là con số duy
 * nhất trong phép chọn NCC không suy từ dữ liệu, nên khi cần đổi thì đổi ở đúng đây.
 */
export const CREDIT_PRICE_TOLERANCE = 0.03;

export interface PrioritySupplierPick<T> {
  supplier: T | null;
  /** True khi đã chọn NCC ĐẮT HƠN chỉ vì có công nợ — phải hiện lý do, không thì bị cho là chọn sai giá. */
  chosenForCredit: boolean;
}

/**
 * NCC ưu tiên cho một mặt hàng.
 *
 * Hai bước, theo đúng thứ tự:
 *   1. `priority` nhỏ nhất → giá nhập rẻ hơn → tên NCC (tiêu chí thứ ba để kết quả không đổi giữa các
 *      lần chạy khi hai NCC hoà cả hai tiêu chí đầu).
 *   2. Nếu NCC vừa chọn KHÔNG cho công nợ, mà có NCC khác **cùng `priority`** cho công nợ với giá chênh
 *      dưới `CREDIT_PRICE_TOLERANCE`, thì đổi sang NCC đó.
 *
 * Chỉ xét trong cùng `priority` vì `priority` là thứ tự người dùng khai tay ("gọi nhà này trước") — đạp
 * lên nó vì lý do giá là đổi một quyết định đã có chủ.
 *
 * **Đây là chỗ DUY NHẤT chọn NCC ưu tiên trong dự án**, dùng cho cả nhịp gọi (suy từ công nợ), Tổng hợp
 * đặt NCC và hàng mua tập trung. Nếu tách ra hai bản thì nhịp gọi suy theo một NCC còn đơn lại đặt cho
 * NCC khác, và không ai hiểu vì sao lệch.
 */
export function pickPrioritySupplier<T extends SupplierPriceLike>(prices: T[]): PrioritySupplierPick<T> {
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
  if (!best || best.hasCredit) return { supplier: best, chosenForCredit: false };

  const ceiling = Number(best.importPrice) * (1 + CREDIT_PRICE_TOLERANCE);
  let credit: T | null = null;
  for (const price of prices) {
    if (!price.hasCredit || price.priority !== best.priority || Number(price.importPrice) > ceiling) continue;
    if (
      !credit ||
      Number(price.importPrice) < Number(credit.importPrice) ||
      (Number(price.importPrice) === Number(credit.importPrice) &&
        price.supplierName.localeCompare(credit.supplierName) < 0)
    ) {
      credit = price;
    }
  }
  return credit ? { supplier: credit, chosenForCredit: true } : { supplier: best, chosenForCredit: false };
}

/** Số ngày phủ mặc định khi không khai ở đâu cả. */
export const DEFAULT_COVER_DAYS = 3;

/**
 * Các thứ chuyển hàng giữa các quán KHÔNG mất phí: Thứ 3 và Thứ 7 (ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật).
 *
 * Để hằng số chứ chưa làm bảng cấu hình: lịch này do bên vận chuyển quy định, đổi thì cả chuỗi đổi cùng
 * lúc, và chưa có nhu cầu khai khác nhau theo quán. Khi cần khai được thì làm bảng một cột `weekday` tên
 * `TransferScheduleDay`, đúng khuôn `Deadline.weekday`.
 */
export const FREE_TRANSFER_WEEKDAYS = [2, 6];

export interface NextTransferDay {
  /** 1 = Thứ 2 … 7 = Chủ nhật. */
  weekday: number;
  /** Số ngày từ hôm nay. 0 = hôm nay chính là ngày chuyển. */
  daysAway: number;
}

/**
 * Ngày chuyển miễn phí gần nhất kể từ hôm nay.
 *
 * Hôm nay LÀ ngày chuyển thì trả `daysAway = 0` — khác `daysUntilNextCreditOrder` (luôn nhảy sang mốc
 * sau). Lý do khác nhau: ở đó đơn đặt hôm nay phải phủ tới lô kế tiếp, còn ở đây hàng đã có sẵn trong
 * kho quán nên chuyển được ngay trong ngày.
 */
export function nextFreeTransferDay(now: Date): NextTransferDay {
  const { weekday } = vnCalendar(now);
  let best: NextTransferDay | null = null;
  for (const day of FREE_TRANSFER_WEEKDAYS) {
    const daysAway = (day - weekday + 7) % 7;
    if (!best || daysAway < best.daysAway) best = { weekday: day, daysAway };
  }
  return best!;
}
