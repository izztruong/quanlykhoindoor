import { combineDateAndHour } from "@/lib/posSaleDate";
import type ExcelJS from "exceljs";

/**
 * Đọc file **nhật ký order** do POS xuất ra, khác hẳn file mẫu của phần mềm này:
 *
 * - Dòng 1 là tiêu đề ("Nhật ký order từ ... tại cửa hàng ..."), hàng tiêu đề cột nằm ở dòng 2.
 * - Ngày và Giờ là HAI cột riêng.
 * - Mỗi dòng là một **thao tác trên đơn** (Loại log / Loại thao tác), không phải một món đã bán. Nên
 *   cộng mù cả file là tính luôn cả những món khách đã huỷ.
 *
 * Vì là format của bên thứ ba, cột được tìm theo **TÊN tiêu đề** chứ không theo chỉ số cố định: POS
 * đổi thứ tự cột hay chèn thêm cột thì vẫn đọc đúng, còn đọc theo chỉ số sẽ lấy nhầm cột mà file
 * trông vẫn bình thường. Thiếu cột bắt buộc thì báo lỗi chứ không đoán.
 */

export interface PosOrderLogRow {
  /** YYYY-MM-DD */
  soldOn: string;
  hour: number;
  posName: string;
  quantity: number;
  logType: string;
  actionType: string;
}

/** Một tổ hợp (Loại log, Loại thao tác) có trong file, kèm số dòng — để người dùng chọn loại nào là đã bán. */
export interface PosOrderLogActionGroup {
  logType: string;
  actionType: string;
  rowCount: number;
  quantity: number;
}

export interface PosOrderLogParseResult {
  rows: PosOrderLogRow[];
  /** Dòng đọc được nhưng thiếu/sai dữ liệu — liệt kê ra chứ không đoán. */
  errors: string[];
  groups: PosOrderLogActionGroup[];
  /** Dòng tiêu đề của file, giữ để hiển thị lại cho người dùng đối chiếu ngày và cửa hàng. */
  title: string;
}

/** Bỏ dấu, hạ chữ thường, gộp khoảng trắng — để so tên cột không phụ thuộc dấu và cách viết hoa. */
function normalizeHeader(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tên cột chấp nhận được cho từng trường. Nhiều biến thể vì POS có thể đổi nhãn giữa các bản. */
const COLUMN_ALIASES = {
  date: ["ngay", "ngay ban", "ngay order"],
  time: ["gio", "gio ban", "thoi gian"],
  posName: ["ten mon", "ten hang", "mon"],
  quantity: ["so luong", "sl"],
  logType: ["loai log"],
  actionType: ["loai thao tac"],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

const REQUIRED_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "date", label: "Ngày" },
  { key: "time", label: "Giờ" },
  { key: "posName", label: "Tên món" },
  { key: "quantity", label: "Số lượng" },
];

/** Số dòng đầu file được quét để tìm hàng tiêu đề — POS có thể chèn thêm vài dòng thông tin. */
const HEADER_SCAN_ROWS = 12;

function findHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; columns: Partial<Record<ColumnKey, number>> } | null {
  const lastRow = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const columns: Partial<Record<ColumnKey, number>> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = normalizeHeader(cell.value);
      if (!text) return;
      for (const [key, aliases] of Object.entries(COLUMN_ALIASES) as [ColumnKey, readonly string[]][]) {
        if (columns[key] === undefined && aliases.includes(text)) columns[key] = colNumber;
      }
    });
    // Hàng tiêu đề thật phải có đủ cột bắt buộc; dòng tiêu đề văn xuôi ở trên sẽ không khớp.
    if (REQUIRED_COLUMNS.every((c) => columns[c.key] !== undefined)) return { rowNumber, columns };
  }
  return null;
}

function cellText(row: ExcelJS.Row, colNumber: number | undefined): string {
  if (colNumber === undefined) return "";
  const value = row.getCell(colNumber).value;
  if (value && typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "").trim();
  if (value && typeof value === "object" && "richText" in value) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join("").trim();
  }
  return String(value ?? "").trim();
}

export function parsePosOrderLog(sheet: ExcelJS.Worksheet): PosOrderLogParseResult {
  const title = cellText(sheet.getRow(1), 1);
  const header = findHeaderRow(sheet);
  if (!header) {
    const missing = REQUIRED_COLUMNS.map((c) => `"${c.label}"`).join(", ");
    return {
      rows: [],
      errors: [`Không tìm thấy hàng tiêu đề trong ${HEADER_SCAN_ROWS} dòng đầu. File POS phải có đủ các cột ${missing}.`],
      groups: [],
      title,
    };
  }

  const { columns } = header;
  const rows: PosOrderLogRow[] = [];
  const errors: string[] = [];
  const groupByKey = new Map<string, PosOrderLogActionGroup>();

  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const posName = cellText(row, columns.posName);
    const dateRaw = columns.date !== undefined ? row.getCell(columns.date).value : null;
    const timeRaw = columns.time !== undefined ? row.getCell(columns.time).value : null;
    const qtyText = cellText(row, columns.quantity);

    // Dòng trống hoàn toàn (POS hay chèn dòng tổng cộng hoặc dòng phân cách) — bỏ qua im lặng.
    if (!posName && !qtyText && dateRaw == null && timeRaw == null) continue;

    const soldAt = combineDateAndHour(dateRaw, timeRaw);
    if (!soldAt) {
      errors.push(`Dòng ${rowNumber}: không đọc được Ngày/Giờ`);
      continue;
    }
    if (!posName) {
      errors.push(`Dòng ${rowNumber}: thiếu Tên món`);
      continue;
    }
    // Số lượng MANG DẤU: thao tác "Bỏ món" ghi số âm, nên nó tự trừ ra khi gộp. Loại bỏ dòng âm là
    // cộng thừa đúng bằng phần khách đã huỷ — file thật đã có dòng như vậy.
    const quantity = Number(qtyText.replace(",", "."));
    if (!Number.isFinite(quantity) || quantity === 0) {
      errors.push(`Dòng ${rowNumber}: Số lượng không hợp lệ (${qtyText || "trống"})`);
      continue;
    }

    const logType = cellText(row, columns.logType);
    const actionType = cellText(row, columns.actionType);
    rows.push({ soldOn: soldAt.soldOn, hour: soldAt.hour, posName, quantity, logType, actionType });

    const key = `${logType}|${actionType}`;
    const group = groupByKey.get(key);
    if (group) {
      group.rowCount += 1;
      group.quantity += quantity;
    } else {
      groupByKey.set(key, { logType, actionType, rowCount: 1, quantity });
    }
  }

  const groups = [...groupByKey.values()].sort((a, b) => b.rowCount - a.rowCount);
  return { rows, errors, groups, title };
}

/** Khoá định danh một tổ hợp (Loại log, Loại thao tác), dùng cho ô tích trên giao diện. */
export function actionGroupKey(group: { logType: string; actionType: string }): string {
  return `${group.logType}|${group.actionType}`;
}

/**
 * Tổ hợp nào được tích sẵn: hai thao tác làm đổi số lượng món trên đơn.
 *
 * Phải tích CẢ "Bỏ món" chứ không chỉ "Thêm món": POS ghi số lượng mang dấu (bỏ món là số âm) nên hai
 * loại cộng lại mới ra số bán thật. Bỏ tích "Bỏ món" là doanh số cao hơn thực tế.
 *
 * Chỉ là MẶC ĐỊNH chứ không phải luật cứng — giao diện liệt kê mọi tổ hợp có trong file kèm số dòng và
 * tổng SL để người dùng tự soát. POS thêm loại thao tác mới thì nó hiện ra ở đó, chưa tích sẵn, chứ
 * không âm thầm lọt vào hay bị bỏ qua.
 */
const DEFAULT_SOLD_ACTIONS = ["them mon", "bo mon"];

export function isDefaultSoldGroup(group: { actionType: string }): boolean {
  return DEFAULT_SOLD_ACTIONS.includes(normalizeHeader(group.actionType));
}
