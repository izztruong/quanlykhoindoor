import { prisma } from "../../config/db";
import { HttpError } from "../../utils/httpError";
import { assertItemsInShopMenu } from "../../utils/shopMenu";
import { parseDateOnly } from "../../utils/vnTime";

/**
 * Bánh tiệm bánh bán ra. Khuôn lấy nguyên từ `posSales.service.saveManualRows` — đây là trục "bán ra"
 * của tiệm bánh, tương đương doanh số POS của quán, nên mọi luật về độ mịn phải giống hệt.
 */

/** Khoá một ô bánh bán ra. `shopUserId = null` nghĩa là BÁN NGOÀI. */
export interface BakerySaleRowKey {
  shopUserId: string | null;
  soldOn: string;
  finishedGoodItemId: string;
}

export interface BakerySaleRowUpsert extends BakerySaleRowKey {
  quantity: number;
}

export interface BakerySaleRowsResult {
  /** Số dòng đã ghi (mới hoặc sửa). */
  written: number;
  /** Số dòng người dùng chủ động xoá. */
  deleted: number;
  /** Trong số `written`, bao nhiêu dòng là GHI ĐÈ lên dòng đã có — phần còn lại là thêm mới. */
  replaced: number;
}

function keyOf(row: BakerySaleRowKey): string {
  return `${row.shopUserId ?? "NGOAI"}|${row.soldOn}|${row.finishedGoodItemId}`;
}

/**
 * Quán mua phải là một QUÁN THẬT: `isShop` và **không phải tiệm bánh**. `null` (bán ngoài) bỏ qua.
 *
 * Chặn tiệm bánh tự mua của chính nó, và chặn gán cho tài khoản không phải quán (kế toán, người
 * duyệt) — dòng như vậy không bao giờ đối chiếu được với phiếu nhập kho của ai.
 */
async function assertBuyersAreShops(bakeryUserId: string, rows: BakerySaleRowKey[]): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.shopUserId).filter((id): id is string => id != null))];
  if (ids.length === 0) return;

  if (ids.includes(bakeryUserId)) {
    throw new HttpError(400, "Tiệm bánh không bán cho chính mình. Chọn một quán khác, hoặc chọn \"Bán ngoài\"");
  }

  const buyers = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: { select: { isShop: true, isBakery: true } } },
  });
  const offenders = buyers.filter((b) => !b.role.isShop || b.role.isBakery).map((b) => b.name);
  // Id không tra ra tài khoản nào cũng là vi phạm — nếu không thì gõ sai id sẽ lọt thành dòng mồ côi.
  if (buyers.length !== ids.length) offenders.push("(tài khoản không tồn tại)");
  if (offenders.length === 0) return;

  throw new HttpError(
    400,
    `Người mua không phải quán: ${[...new Set(offenders)].join(", ")}. Chọn một quán, hoặc chọn "Bán ngoài"`,
  );
}

/**
 * Ghi/sửa/xoá từng dòng bánh bán ra.
 *
 * **Chỉ đụng đúng những ô được nêu** — không xoá theo ngày, không xoá theo quán. Bắt buộc như vậy vì
 * danh sách có phân trang: màn chỉ tải 20 dòng, nên mọi phép xoá theo phạm vi rộng hơn sẽ xoá mất
 * dữ liệu người dùng không nhìn thấy. Muốn xoá cả ngày thì có `DELETE /bakery-sales/day` riêng.
 *
 * Đổi người mua hay đổi bánh của một dòng = gửi khoá cũ trong `deletes` và khoá mới trong `upserts`
 * **cùng một lần gọi**, để không có lúc nào mất dòng.
 *
 * Dùng `deleteMany` + `createMany`, KHÔNG `upsert` theo compound unique: khoá có `shopUserId`
 * nullable, mà SQL không khớp được `NULL = NULL` nên `upsert` sẽ không bao giờ tìm thấy dòng "bán
 * ngoài" cũ và cứ tạo dòng mới. `deleteMany` thì sinh `shopUserId IS NULL` đúng. Đây là lần thứ ba
 * repo gặp bẫy đó — xem mục "Index viết tay" trong CLAUDE.md.
 */
export async function saveBakerySales(
  bakeryUserId: string,
  upserts: BakerySaleRowUpsert[],
  deletes: BakerySaleRowKey[],
  actingUserId: string | undefined,
): Promise<BakerySaleRowsResult> {
  if (upserts.length === 0 && deletes.length === 0) return { written: 0, deleted: 0, replaced: 0 };

  // Trùng khoá trong cùng một lô sẽ làm createMany vỡ ở ràng buộc unique — báo trước cho rõ ràng.
  const seen = new Set<string>();
  const duplicated: BakerySaleRowUpsert[] = [];
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
      `Có dòng trùng nhau (cùng ngày, cùng người mua, cùng bánh): ${names.map((n) => n.name).join(", ")}. Gộp lại thành một dòng`,
    );
  }

  await assertBuyersAreShops(bakeryUserId, [...upserts, ...deletes]);
  // Bánh phải nằm trong menu của TIỆM BÁNH — nó mới là bên bán.
  await assertItemsInShopMenu(bakeryUserId, upserts.map((r) => r.finishedGoodItemId));

  const toWhere = (row: BakerySaleRowKey) => ({
    shopUserId: row.shopUserId,
    soldOn: parseDateOnly(row.soldOn),
    finishedGoodItemId: row.finishedGoodItemId,
  });

  return prisma.$transaction(async (tx) => {
    // HAI lượt xoá riêng, không gộp: gộp lại thì không biết bao nhiêu dòng người dùng thật sự xoá và
    // bao nhiêu chỉ là ghi đè — xem chú thích cùng chỗ ở `saveManualRows`.
    const deleted = deletes.length
      ? (await tx.bakerySale.deleteMany({ where: { bakeryUserId, OR: deletes.map(toWhere) } })).count
      : 0;
    const replaced = upserts.length
      ? (await tx.bakerySale.deleteMany({ where: { bakeryUserId, OR: upserts.map(toWhere) } })).count
      : 0;
    if (upserts.length > 0) {
      await tx.bakerySale.createMany({
        data: upserts.map((row) => ({
          bakeryUserId,
          shopUserId: row.shopUserId,
          soldOn: parseDateOnly(row.soldOn),
          finishedGoodItemId: row.finishedGoodItemId,
          quantity: row.quantity,
          createdById: actingUserId,
        })),
      });
    }
    return { written: upserts.length, deleted, replaced };
  });
}
