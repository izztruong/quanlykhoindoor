import { prisma } from "../../config/db";
import { normalizePosName } from "../posItemMappings/posItemMappings.service";
import type { PosSaleRow } from "./posSales.schemas";

/**
 * Chuỗi "YYYY-MM-DD" → Date đúng ngày đó. Ép về giữa trưa UTC thay vì 00:00: cột là `@db.Date` nên
 * phần giờ bị bỏ, nhưng đi qua 00:00 UTC thì bất kỳ phép đổi múi giờ lẫn vào đâu đó cũng có thể lùi
 * sang ngày hôm trước. Giữa trưa thì lệch ±7 tiếng vẫn nằm trong cùng một ngày.
 */
export function parseDateOnly(soldOn: string): Date {
  return new Date(`${soldOn}T12:00:00.000Z`);
}

export interface ImportResult {
  /** Số ô (ngày × giờ × món) đã ghi. */
  written: number;
  /** Số ngày bị ghi đè. */
  daysReplaced: number;
  /** Tên POS chưa có ánh xạ — KHÔNG nhập dòng nào cho tới khi ánh xạ xong. */
  unmappedNames: string[];
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
  const itemIdByNormalized = new Map(mappings.map((m) => [m.posName, m.finishedGoodItemId]));

  const unmappedNames = [...normalizedByRaw.entries()]
    .filter(([, normalized]) => !itemIdByNormalized.has(normalized))
    .map(([raw]) => raw)
    .sort((a, b) => a.localeCompare(b));
  if (unmappedNames.length > 0) return { written: 0, daysReplaced: 0, unmappedNames };

  // Gộp trùng trong chính file: cùng (ngày, giờ, món) có thể đến từ nhiều tên POS khác nhau đều ánh
  // xạ về một món, và từ nhiều dòng đơn lẻ — phải CỘNG lại, không phải lấy dòng cuối.
  const byCell = new Map<string, { soldOn: string; hour: number; finishedGoodItemId: string; quantity: number }>();
  for (const row of rows) {
    const finishedGoodItemId = itemIdByNormalized.get(normalizedByRaw.get(row.posName)!)!;
    const key = `${row.soldOn}|${row.hour}|${finishedGoodItemId}`;
    const current = byCell.get(key);
    if (current) current.quantity += row.quantity;
    else byCell.set(key, { soldOn: row.soldOn, hour: row.hour, finishedGoodItemId, quantity: row.quantity });
  }

  const days = [...new Set(rows.map((r) => r.soldOn))];
  const cells = [...byCell.values()];

  await prisma.$transaction(
    async (tx) => {
      await tx.posSaleHour.deleteMany({ where: { userId, soldOn: { in: days.map(parseDateOnly) } } });
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

  return { written: cells.length, daysReplaced: days.length, unmappedNames: [] };
}
