import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { parseDateOnly } from "../../utils/vnTime";
import { normalizePosName } from "../posItemMappings/posItemMappings.service";
import type { PosSaleRow } from "./posSales.schemas";

/** Định nghĩa gốc ở `utils/vnTime.ts` (Check Cost cũng cần); re-export để call-site trong module khỏi đổi. */
export { parseDateOnly };

/**
 * Chặn ở SERVER, không chỉ ẩn trên giao diện: POS chỉ bán món (TRA/DAV), còn THANH_PHAM là đồ pha sẵn
 * đếm ở phiếu kiểm kê quán. Dữ liệu thật đã có 12 dòng Check Cost ghi nhầm đồ thành phẩm thành món đã
 * bán, vì hai tên chỉ khác nhau chữ hoa ("Thạch matcha" vs "Thạch Matcha").
 *
 * Phải gọi ở CẢ HAI đường nhập. Trước đây chỉ đường gõ tay có chốt này, nên 211 ô đồ pha sẵn đã lọt
 * vào DB qua đường Excel — và từ khi Check Cost lấy doanh số từ POS thì mỗi ô như vậy vừa sinh doanh
 * thu ảo vừa bị tính hai lần (nó đã nằm trong tồn đầu/cuối kỳ của phiếu kiểm kê).
 */
async function assertNoPreparedItems(finishedGoodItemIds: string[]): Promise<void> {
  if (finishedGoodItemIds.length === 0) return;
  const prepared = await prisma.finishedGoodItem.findMany({
    where: { id: { in: [...new Set(finishedGoodItemIds)] }, category: "THANH_PHAM" },
    select: { code: true, name: true },
  });
  if (prepared.length === 0) return;
  const names = prepared.map((p) => `${p.name} (${p.code})`).join(", ");
  throw new HttpError(
    400,
    `Không nhập doanh số cho đồ thành phẩm: ${names}. POS chỉ bán món, đồ pha sẵn thì đếm ở phiếu kiểm kê`,
  );
}

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
  await assertNoPreparedItems(cells.map((c) => c.finishedGoodItemId));
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

  await prisma.$transaction(
    async (tx) => {
      // OR theo từng (ngày, giờ) thay vì `soldOn in days`: đúng độ mịn cần xoá. Một file 2 tháng sinh
      // tối đa 60 × 24 = 1.440 mệnh đề, Postgres chịu được thoải mái.
      await tx.posSaleHour.deleteMany({
        where: { userId, OR: hourSlots.map((slot) => ({ soldOn: slot.soldOn, hour: slot.hour })) },
      });
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
// Nhập TAY theo DÒNG (ngày × giờ × món)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vì sao có đường nhập tay bên cạnh nhập Excel: quán nhập doanh số **mỗi khi hết ca** — 3 ca × 3 quán =
 * 9 lượt mỗi ngày. Xuất file POS 9 lần một ngày là gánh nặng thật.
 *
 * Người dùng tự khai **giờ thật** của từng dòng, nên dữ liệu gõ tay mịn đúng bằng dữ liệu Excel — không
 * còn phải đoán chỗ đặt số. Muốn khai gọn cả ca thì cứ đặt vào một giờ; cách nhập theo dòng bao trùm.
 *
 * `source = MANUAL` chỉ còn mang nghĩa **xuất xứ** (người gõ, không phải POS xuất ra), dùng khi đối chiếu
 * số liệu trông lạ: biết nên soát file hay soát người nhập.
 */

/** Khoá một ô doanh số. Đúng bộ `@@unique([userId, soldOn, hour, finishedGoodItemId])`. */
export interface ManualRowKey {
  soldOn: string;
  hour: number;
  finishedGoodItemId: string;
}

export interface ManualRowUpsert extends ManualRowKey {
  quantity: number;
}

export interface ManualRowsResult {
  /** Số dòng đã ghi (mới hoặc sửa). */
  written: number;
  /** Số dòng người dùng chủ động xoá. */
  deleted: number;
  /** Trong số `written`, bao nhiêu dòng là GHI ĐÈ lên dòng đã có — phần còn lại là thêm mới. */
  replaced: number;
}

function keyOf(row: ManualRowKey): string {
  return `${row.soldOn}|${row.hour}|${row.finishedGoodItemId}`;
}

/**
 * Ghi/sửa/xoá từng dòng doanh số do người dùng gõ tay.
 *
 * **Chỉ đụng đúng những ô được nêu** — không xoá theo ngày, không xoá theo ca. Đây là điều kiện bắt buộc
 * khi danh sách có phân trang: màn chỉ tải 20 dòng, nên bất kỳ phép xoá theo phạm vi rộng hơn sẽ xoá mất
 * dữ liệu người dùng không nhìn thấy.
 *
 * Đổi giờ hay đổi món của một dòng = gửi khoá cũ trong `deletes` và khoá mới trong `upserts` cùng một lần.
 */
export async function saveManualRows(
  userId: string,
  upserts: ManualRowUpsert[],
  deletes: ManualRowKey[],
): Promise<ManualRowsResult> {
  if (upserts.length === 0 && deletes.length === 0) return { written: 0, deleted: 0, replaced: 0 };

  // Trùng khoá trong cùng một lô sẽ làm createMany vỡ ở ràng buộc unique — báo trước cho rõ ràng.
  const seen = new Set<string>();
  const duplicated: ManualRowUpsert[] = [];
  for (const row of upserts) {
    const k = keyOf(row);
    if (seen.has(k)) duplicated.push(row);
    else seen.add(k);
  }
  if (duplicated.length > 0) {
    const names = await prisma.finishedGoodItem.findMany({
      where: { id: { in: [...new Set(duplicated.map((d) => d.finishedGoodItemId))] } },
      select: { name: true },
    });
    throw new HttpError(
      400,
      `Có dòng trùng nhau (cùng ngày, cùng giờ, cùng món): ${names.map((n) => n.name).join(", ")}. Gộp lại thành một dòng`,
    );
  }

  await assertNoPreparedItems(upserts.map((r) => r.finishedGoodItemId));

  const toWhere = (row: ManualRowKey) => ({
    soldOn: parseDateOnly(row.soldOn),
    hour: row.hour,
    finishedGoodItemId: row.finishedGoodItemId,
  });
  return prisma.$transaction(async (tx) => {
    // HAI lượt xoá riêng, không gộp: gộp lại thì không biết bao nhiêu dòng người dùng thật sự xoá và bao
    // nhiêu chỉ là ghi đè. Trừ `upserts.length` ra khỏi tổng là sai — dòng đổi sang giờ mới thì khoá đó
    // chưa từng tồn tại (đã bắt được khi kiểm).
    const deleted = deletes.length
      ? (await tx.posSaleHour.deleteMany({ where: { userId, OR: deletes.map(toWhere) } })).count
      : 0;
    const replaced = upserts.length
      ? (await tx.posSaleHour.deleteMany({ where: { userId, OR: upserts.map(toWhere) } })).count
      : 0;
    if (upserts.length > 0) {
      await tx.posSaleHour.createMany({
        data: upserts.map((row) => ({
          userId,
          soldOn: parseDateOnly(row.soldOn),
          hour: row.hour,
          finishedGoodItemId: row.finishedGoodItemId,
          quantity: row.quantity,
          source: "MANUAL" as const,
        })),
      });
    }
    return { written: upserts.length, deleted, replaced };
  });
}
