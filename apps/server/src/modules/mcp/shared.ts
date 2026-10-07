import { z } from "zod";
import { VN_OFFSET_MS } from "../../utils/deadlines";

/**
 * Khung chung cho mọi tool MCP. Thêm tool mới: tạo một file trong `tools/` gọi `defineTool`, rồi
 * thêm một dòng vào mảng `MCP_TOOLS` (tools/index.ts). Trang Token MCP tự mọc ô tick cho tool đó,
 * nhưng token cũ KHÔNG tự có — phải tick thêm.
 *
 * Tool chỉ được ĐỌC. Không có tool nào nhận SQL tự do.
 */

/** Ngữ cảnh của token đang gọi. Muốn giới hạn token theo quán về sau thì thêm trường ở đây. */
export interface McpToolContext {
  tokenId: string;
  tokenName: string;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  run: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<unknown>;
}

export function defineTool<Shape extends z.ZodRawShape>(def: {
  name: string;
  title: string;
  description: string;
  input: Shape;
  run: (args: z.infer<z.ZodObject<Shape>>, ctx: McpToolContext) => Promise<unknown>;
}): McpTool {
  // SDK đã kiểm args theo `input` trước khi gọi run, nên ép kiểu ở đây là an toàn.
  return { ...def, run: (args, ctx) => def.run(args as z.infer<z.ZodObject<Shape>>, ctx) };
}

// ── Ngày tháng ────────────────────────────────────────────────────────────────────────────────
// Tham số ngày luôn là "YYYY-MM-DD" hiểu theo giờ VN. KHÔNG dùng utils/pagination.parseDateRange:
// hàm đó setHours theo giờ máy chủ, mà Render chạy UTC nên cuối ngày bị lệch 7 tiếng.

const DAY_MS = 24 * 60 * 60 * 1000;

export const dayParam = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD").describe(`${label} (YYYY-MM-DD, giờ Việt Nam, tính cả ngày này)`);

export const dateRangeInput = {
  from: dayParam("Từ ngày"),
  to: dayParam("Đến ngày"),
};

export const shopIdParam = z
  .string()
  .optional()
  .describe("Lọc theo một quán — id lấy từ tool list_shops. Bỏ trống = mọi quán.");

function utcMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Cho cột `@db.Date` (ngày trần, không giờ): Prisma đọc/ghi chúng là 00:00 UTC. */
export function dateColumnRange(from: string, to: string) {
  return { gte: new Date(utcMidnight(from)), lte: new Date(utcMidnight(to)) };
}

/** Cho cột `DateTime`: từ 00:00 ngày `from` tới hết 23:59:59.999 ngày `to`, theo giờ VN. */
export function dateTimeRange(from: string, to: string) {
  return { gte: new Date(utcMidnight(from) - VN_OFFSET_MS), lt: new Date(utcMidnight(to) + DAY_MS - VN_OFFSET_MS) };
}

/** Cột `@db.Date` → "YYYY-MM-DD" (đọc theo UTC vì Prisma lưu ngày trần ở 00:00 UTC). */
export function formatDateColumn(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Cột `DateTime` → "YYYY-MM-DD HH:mm" theo giờ VN. */
export function formatVnDateTime(date: Date | null | undefined): string | null {
  return date ? new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : null;
}

/** Cột `DateTime` → "YYYY-MM-DD" theo giờ VN. */
export function formatVnDay(date: Date | null | undefined): string | null {
  return formatVnDateTime(date)?.slice(0, 10) ?? null;
}

// ── Kết quả ───────────────────────────────────────────────────────────────────────────────────

/** Trần số dòng mỗi lần gọi — kết quả quá lớn thì claude.ai cắt hoặc từ chối. */
export const MAX_ROWS = 500;

export function capRows<T>(rows: T[]) {
  const truncated = rows.length > MAX_ROWS;
  return {
    rowCount: rows.length,
    truncated,
    ...(truncated ? { notice: `Chỉ trả ${MAX_ROWS}/${rows.length} dòng đầu — thu hẹp khoảng ngày hoặc lọc theo quán để lấy đủ.` } : {}),
    rows: truncated ? rows.slice(0, MAX_ROWS) : rows,
  };
}

/** Decimal của Prisma → number (null giữ nguyên). */
export function num(value: { toString(): string } | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/** Cộng tiền trên đủ mọi dòng, làm tròn đồng để tránh đuôi 0.0000001 của số thực. */
export function sumAmounts(rows: { amount: number | null }[]): number {
  return Math.round(rows.reduce((total, row) => total + (row.amount ?? 0), 0));
}

/**
 * Dòng chung của 4 tool chi (đơn hàng, chi chốt ca, đề xuất chi, chi ngoài) — cùng khuôn để
 * Claude nối bảng không phải đổi tên cột. Không có cột phân loại: việc đó để phía Claude làm.
 */
export interface ExpenseRow {
  date: string | null;
  name: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  source: string;
  docCode: string | null;
  note: string | null;
  shop: string | null;
}

export const EXPENSE_ROW_DOC =
  "Mỗi dòng: date (YYYY-MM-DD giờ VN), name, unit, quantity, unitPrice, amount, source, docCode, note, shop. " +
  "totalAmount là tổng thành tiền của TOÀN BỘ dòng khớp bộ lọc (kể cả khi rows bị cắt). Tiền tính bằng đồng.";

/**
 * Giá một dòng hàng của đơn: giá trên phiếu xuất nếu admin có nhập lúc xử lý đơn, không thì giá
 * vốn hiện tại của hàng hoá — đúng giá Check Cost dùng. Thực tế form xử lý đơn để trống giá thì lưu
 * 0, và dữ liệu thật gần như toàn dòng giá 0, nên không có bước lùi này thì cả cột thành tiền bằng 0.
 * `priceSource` cho biết dòng nào lấy giá nào: giá vốn hàng hoá là giá HIỆN TẠI, không phải giá lúc nhận.
 */
export function orderLinePrice(quantity: number | null, exportPrice: number | null, productCostPrice: number | null) {
  const fromExport = exportPrice != null && exportPrice > 0;
  const unitPrice = fromExport ? exportPrice : productCostPrice ?? 0;
  return {
    unitPrice,
    amount: Math.round((quantity ?? 0) * unitPrice),
    priceSource: fromExport ? ("EXPORT" as const) : ("PRODUCT_COST" as const),
  };
}

export const ORDER_PRICE_DOC =
  "priceSource: EXPORT = giá NCC admin nhập lúc xử lý đơn; PRODUCT_COST = admin không nhập giá nên lấy giá vốn " +
  "HIỆN TẠI của hàng hoá (cùng giá Check Cost dùng — đổi giá vốn về sau thì số này đổi theo).";
