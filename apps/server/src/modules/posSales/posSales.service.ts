import { prisma } from "../../config/db";
import type { PosSaleSource, ShiftCode } from "../../generated/prisma/client";
import { HttpError } from "../../utils/httpError";
import { normalizePosName } from "../posItemMappings/posItemMappings.service";
import type { PosSaleRow } from "./posSales.schemas";
import { hourBelongsToShift, shiftCells, shiftMidCell, spansMidnight } from "./shiftSlicing";

/**
 * Chuỗi "YYYY-MM-DD" → Date đúng ngày đó. Ép về giữa trưa UTC thay vì 00:00: cột là `@db.Date` nên
 * phần giờ bị bỏ, nhưng đi qua 00:00 UTC thì bất kỳ phép đổi múi giờ lẫn vào đâu đó cũng có thể lùi
 * sang ngày hôm trước. Giữa trưa thì lệch ±7 tiếng vẫn nằm trong cùng một ngày.
 */
export function parseDateOnly(soldOn: string): Date {
  return new Date(`${soldOn}T12:00:00.000Z`);
}

/** "YYYY-MM-DD" cộng/trừ số ngày, vẫn ở dạng chuỗi ngày thuần (không đi qua múi giờ nào). */
function addDays(dateKey: string, offset: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

type ShiftDefinitionLike = { code: ShiftCode; startHour: number; startMinute: number; endHour: number; endMinute: number };

export interface ImportResult {
  /** Số ô (ngày × giờ × món) đã ghi. */
  written: number;
  /** Số ngày bị ghi đè. */
  daysReplaced: number;
  /** Tên POS chưa có ánh xạ — KHÔNG nhập dòng nào cho tới khi ánh xạ xong. */
  unmappedNames: string[];
  /** Tên đã được khai "bỏ qua" và bị loại khỏi lần nhập này — báo lại để không ai tưởng là mất dữ liệu. */
  ignoredNames: string[];
}

/**
 * Nạp doanh số POS cho một quán.
 *
 * Hai quy tắc quan trọng:
 *
 *  - **Thiếu ánh xạ thì không nhập gì cả.** Nhập nửa vời tạo ra một ngày có số liệu thiếu món, trông
 *    y như một ngày bán ít — và không có cách nào phát hiện về sau. Trả danh sách tên chưa ánh xạ để
 *    admin khai rồi nhập lại.
 *  - **Ghi đè theo NGÀY, không cộng dồn.** Nhập lại cùng một ngày là sửa lại ngày đó (vd lần đầu xuất
 *    thiếu ca cuối), nên phải xoá sạch ngày đó trước khi ghi. Cộng dồn thì nhập hai lần là số liệu
 *    gấp đôi mà không ai biết.
 */
export async function importPosSales(userId: string, rows: PosSaleRow[]): Promise<ImportResult> {
  const normalizedByRaw = new Map<string, string>();
  for (const row of rows) normalizedByRaw.set(row.posName, normalizePosName(row.posName));

  const mappings = await prisma.posItemMapping.findMany({
    where: { posName: { in: [...new Set(normalizedByRaw.values())] } },
    select: { posName: true, finishedGoodItemId: true },
  });
  // Giá trị có thể là null = đã khai "bỏ qua". Dùng `has` để phân biệt với "chưa ánh xạ" (không có khoá).
  const itemIdByNormalized = new Map(mappings.map((m) => [m.posName, m.finishedGoodItemId]));

  const unmappedNames = [...normalizedByRaw.entries()]
    .filter(([, normalized]) => !itemIdByNormalized.has(normalized))
    .map(([raw]) => raw)
    .sort((a, b) => a.localeCompare(b));
  if (unmappedNames.length > 0) return { written: 0, daysReplaced: 0, unmappedNames, ignoredNames: [] };

  const ignoredNames = [...normalizedByRaw.entries()]
    .filter(([, normalized]) => itemIdByNormalized.get(normalized) === null)
    .map(([raw]) => raw)
    .sort((a, b) => a.localeCompare(b));

  // Gộp trùng trong chính file: cùng (ngày, giờ, món) có thể đến từ nhiều tên POS khác nhau đều ánh
  // xạ về một món, và từ nhiều dòng đơn lẻ — phải CỘNG lại, không phải lấy dòng cuối.
  const byCell = new Map<string, { soldOn: string; hour: number; finishedGoodItemId: string; quantity: number }>();
  for (const row of rows) {
    const finishedGoodItemId = itemIdByNormalized.get(normalizedByRaw.get(row.posName)!);
    if (finishedGoodItemId == null) continue; // tên đã khai bỏ qua
    const key = `${row.soldOn}|${row.hour}|${finishedGoodItemId}`;
    const current = byCell.get(key);
    if (current) current.quantity += row.quantity;
    else byCell.set(key, { soldOn: row.soldOn, hour: row.hour, finishedGoodItemId, quantity: row.quantity });
  }

  const cells = [...byCell.values()];
  const days = [...new Set(cells.map((c) => c.soldOn))];

  /**
   * Ghi đè theo GIỜ, không theo ngày.
   *
   * Quán nhập doanh số **mỗi ca một lần**, nên xoá cả ngày rồi ghi lại sẽ khiến file ca chiều xoá sạch
   * dữ liệu ca sáng. Chỉ xoá đúng những ô `(ngày, giờ)` có mặt trong file rồi ghi lại: nhập lại cùng
   * một file vẫn không nhân đôi, mà từng ca không đạp lên nhau.
   *
   * Đánh đổi: một giờ đã có dữ liệu mà file mới không nhắc tới thì KHÔNG bị xoá. Muốn xoá hẳn thì dùng
   * `DELETE /day`.
   *
   * Cũng suy từ CÁC Ô THẬT chứ không phải mọi dòng trong file: một ngày mà cả file chỉ có dòng bị bỏ
   * qua thì không đụng tới gì cả.
   */
  const hourSlots = [...new Set(cells.map((c) => `${c.soldOn}|${c.hour}`))].map((key) => {
    const [soldOn, hour] = key.split("|");
    return { soldOn: parseDateOnly(soldOn), hour: Number(hour) };
  });

  /**
   * Ngoài các ô có trong file, còn phải xoá **mọi dòng MANUAL của những CA mà file chạm tới**.
   *
   * Vì sao: số gõ tay là tổng của cả ca, đặt ở một ô giữa ca. Nếu chỉ xoá theo ô giờ thì file Excel có
   * dữ liệu ca đó nhưng không có dòng nào đúng giờ giữa ca sẽ để dòng gõ tay sống sót — và tổng của ca
   * thành Excel + số gõ tay, tức **cộng đúp**. Đã dựng đúng tình huống này khi kiểm.
   *
   * Chỉ xoá dòng MANUAL, không xoá dòng EXCEL ngoài các ô trong file: nhập một file lẻ một ca không được
   * phép xoá dữ liệu Excel của ca khác.
   */
  const shifts = await prisma.shiftDefinition.findMany();
  const touchedShifts = new Map<string, { businessDate: string; shift: ShiftDefinitionLike }>();
  for (const cell of cells) {
    for (const shift of shifts) {
      if (!hourBelongsToShift(cell.hour, shift)) continue;
      // Ca qua nửa đêm: giờ trước mốc kết thúc thuộc ngày kinh doanh HÔM TRƯỚC.
      const afterMidnight =
        spansMidnight(shift) && cell.hour * 60 + 30 < shift.endHour * 60 + shift.endMinute;
      const businessDate = afterMidnight ? addDays(cell.soldOn, -1) : cell.soldOn;
      touchedShifts.set(`${businessDate}|${shift.code}`, { businessDate, shift });
    }
  }
  const manualCells = [...touchedShifts.values()].flatMap(({ businessDate, shift }) =>
    shiftCells(businessDate, shift as never).map((c) => ({ soldOn: parseDateOnly(c.soldOn), hour: c.hour })),
  );

  await prisma.$transaction(
    async (tx) => {
      // OR theo từng (ngày, giờ) thay vì `soldOn in days`: đúng độ mịn cần xoá. Một file 2 tháng sinh
      // tối đa 60 × 24 = 1.440 mệnh đề, Postgres chịu được thoải mái.
      await tx.posSaleHour.deleteMany({
        where: { userId, OR: hourSlots.map((slot) => ({ soldOn: slot.soldOn, hour: slot.hour })) },
      });
      if (manualCells.length > 0) {
        await tx.posSaleHour.deleteMany({ where: { userId, source: "MANUAL", OR: manualCells } });
      }
      await tx.posSaleHour.createMany({
        data: cells.map((cell) => ({
          userId,
          soldOn: parseDateOnly(cell.soldOn),
          hour: cell.hour,
          finishedGoodItemId: cell.finishedGoodItemId,
          quantity: cell.quantity,
        })),
      });
    },
    // File 2 tháng có thể lên vài chục nghìn ô; 5 giây mặc định không đủ khi chạy qua Neon.
    { timeout: 60000 },
  );

  return { written: cells.length, daysReplaced: days.length, unmappedNames: [], ignoredNames };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nhập TAY theo ca
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vì sao có đường nhập tay bên cạnh nhập Excel: quán nhập doanh số **mỗi khi hết ca** — 3 ca × 3 quán =
 * 9 lượt mỗi ngày. Xuất file POS 9 lần một ngày là gánh nặng thật, nên phải có đường gõ trực tiếp.
 *
 * Nhưng lưu trữ vẫn ở mức GIỜ, không thêm bảng theo ca: đổi mốc chia ca về sau phải là TÍNH LẠI chứ
 * không phải nhập lại. Nên số gõ tay được đặt vào **ô giữa ca** và đánh dấu `source = MANUAL` —
 * phép cắt ca vẫn ra đúng tổng, còn chi tiết theo giờ thì nói thẳng là không có.
 */

export interface ShiftSalesItemInput {
  finishedGoodItemId: string;
  quantity: number;
}

export interface ShiftSalesResult {
  /** Số món đã ghi (bỏ những món để 0). */
  written: number;
  /** Số ô (ngày × giờ × món) bị xoá để ghi lại — gồm cả dữ liệu Excel cũ của ca đó. */
  replaced: number;
  /** Ô giữa ca mà số được đặt vào, để giao diện nói rõ. */
  storedAt: { soldOn: string; hour: number };
  /** Ca này trước đó có dữ liệu từ file Excel không — ghi tay là ĐÈ MẤT chi tiết giờ đó. */
  hadExcelData: boolean;
}

/**
 * Ghi doanh số một ca do người dùng gõ tay.
 *
 * **Ghi đè trọn ca, kể cả dữ liệu Excel.** Người gõ đang khẳng định tổng của cả ca, nên giữ lại phần cũ
 * sẽ thành cộng dồn. Trả về `hadExcelData` để giao diện cảnh báo trước khi người dùng mất chi tiết giờ.
 */
export async function saveShiftSales(
  userId: string,
  businessDate: string,
  shift: ShiftCode,
  items: ShiftSalesItemInput[],
): Promise<ShiftSalesResult> {
  const shiftDef = await prisma.shiftDefinition.findUnique({ where: { code: shift } });
  if (!shiftDef) {
    throw new HttpError(409, "Chưa khai khung giờ ca — vào Quản trị › Khung giờ ca để thiết lập");
  }

  const mid = shiftMidCell(businessDate, shiftDef);
  if (!mid) {
    throw new HttpError(409, `Ca ${shiftDef.name} không phủ giờ nào — kiểm lại mốc bắt đầu/kết thúc ở Khung giờ ca`);
  }

  // Chặn ở SERVER, không chỉ ẩn trên giao diện: POS chỉ bán món (TRA/DAV), còn THANH_PHAM là đồ pha sẵn
  // đếm trong kho. Dữ liệu thật đã có 12 dòng Check Cost ghi nhầm đồ thành phẩm thành món đã bán, vì hai
  // tên chỉ khác nhau chữ hoa ("Thạch matcha" vs "Thạch Matcha").
  const ids = [...new Set(items.map((it) => it.finishedGoodItemId))];
  const prepared = await prisma.finishedGoodItem.findMany({
    where: { id: { in: ids }, category: "THANH_PHAM" },
    select: { code: true, name: true },
  });
  if (prepared.length > 0) {
    const names = prepared.map((p) => `${p.name} (${p.code})`).join(", ");
    throw new HttpError(400, `Không nhập doanh số cho đồ thành phẩm: ${names}. POS chỉ bán món, đồ pha sẵn thì đếm ở phiếu kiểm kê`);
  }

  const cells = shiftCells(businessDate, shiftDef);
  const cellFilter = cells.map((c) => ({ soldOn: parseDateOnly(c.soldOn), hour: c.hour }));

  // Món để 0 thì KHÔNG ghi dòng: quy ước xuyên suốt là "không có dòng = bán 0". Ghi dòng 0 chỉ làm phình
  // dữ liệu và làm màn chi tiết theo giờ đầy số 0 vô nghĩa.
  const toWrite = items.filter((it) => it.quantity > 0);

  const result = await prisma.$transaction(async (tx) => {
    const hadExcel = await tx.posSaleHour.count({
      where: { userId, source: "EXCEL", OR: cellFilter },
    });
    const { count: replaced } = await tx.posSaleHour.deleteMany({ where: { userId, OR: cellFilter } });
    if (toWrite.length > 0) {
      await tx.posSaleHour.createMany({
        data: toWrite.map((it) => ({
          userId,
          soldOn: parseDateOnly(mid.soldOn),
          hour: mid.hour,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          source: "MANUAL" as const,
        })),
      });
    }
    return { replaced, hadExcelData: hadExcel > 0 };
  });

  return { written: toWrite.length, replaced: result.replaced, storedAt: mid, hadExcelData: result.hadExcelData };
}

export interface ShiftSalesRow {
  finishedGoodItemId: string;
  code: string;
  name: string;
  quantity: number;
}

export interface ShiftSalesSnapshot {
  businessDate: string;
  shift: ShiftCode;
  shiftName: string;
  /** Các ô giờ mà ca này phủ — giao diện dùng để nói "ca này gồm những giờ nào". */
  hours: number[];
  /** Tổng theo món, gộp mọi ô trong ca — dùng được cho cả dữ liệu Excel lẫn dữ liệu gõ tay. */
  items: ShiftSalesRow[];
  /** EXCEL / MANUAL / cả hai / chưa có gì — quyết định câu cảnh báo trên màn. */
  sources: PosSaleSource[];
}

/** Doanh số hiện có của một ca, gộp theo món — để nhập lại là SỬA chứ không phải gõ lại từ đầu. */
export async function getShiftSales(userId: string, businessDate: string, shift: ShiftCode): Promise<ShiftSalesSnapshot> {
  const shiftDef = await prisma.shiftDefinition.findUnique({ where: { code: shift } });
  if (!shiftDef) {
    throw new HttpError(409, "Chưa khai khung giờ ca — vào Quản trị › Khung giờ ca để thiết lập");
  }

  const cells = shiftCells(businessDate, shiftDef);
  const rows = await prisma.posSaleHour.findMany({
    where: { userId, OR: cells.map((c) => ({ soldOn: parseDateOnly(c.soldOn), hour: c.hour })) },
    include: { finishedGoodItem: { select: { id: true, code: true, name: true } } },
  });

  const byItem = new Map<string, ShiftSalesRow>();
  for (const row of rows) {
    const current = byItem.get(row.finishedGoodItemId);
    if (current) current.quantity += Number(row.quantity);
    else {
      byItem.set(row.finishedGoodItemId, {
        finishedGoodItemId: row.finishedGoodItemId,
        code: row.finishedGoodItem.code,
        name: row.finishedGoodItem.name,
        quantity: Number(row.quantity),
      });
    }
  }

  return {
    businessDate,
    shift,
    shiftName: shiftDef.name,
    hours: cells.map((c) => c.hour),
    items: [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name)),
    sources: [...new Set(rows.map((r) => r.source))],
  };
}
