import { prisma } from "../config/db";
import type { AuthUser } from "../middleware/auth";
import type { Prisma } from "../generated/prisma/client";
import { HttpError } from "./httpError";
import { vnDayStartMs } from "./vnTime";

/**
 * Menu đồ thành phẩm theo quán.
 *
 * MỌI quy tắc về menu nằm trong file này — đừng viết lại mảnh `where` hay phép chặn ở chỗ khác, vì
 * quy ước "chưa gán = mọi quán thấy" mà có hai bản là có hai bản lệch nhau.
 */

/**
 * Mảnh `where` lọc danh mục theo menu của một quán.
 *
 * `shops: { none: {} }` chính là quy ước "món CHƯA GÁN quán nào thì hiện ở MỌI quán": nhờ nó dữ liệu
 * cũ (không có dòng gán nào) chạy nguyên vẹn và quán mới mở thấy đủ danh mục chung.
 *
 * Không có quán (admin xem toàn hệ thống, hoặc tài khoản không phải quán) thì trả `{}` — không lọc.
 */
export function menuWhere(shopUserId: string | undefined): Prisma.FinishedGoodItemWhereInput {
  if (!shopUserId) return {};
  return { OR: [{ shops: { some: { shopUserId } } }, { shops: { none: {} } }] };
}

/**
 * Quán nào đang được hỏi — cùng hợp đồng như `ownerWhere`/`resolveTargetUserId`: phạm vi do SERVER
 * quyết định, tham số của client chỉ có nghĩa với người có `DATA.SCOPE_ALL`.
 *
 * `scope === "SELF"` thì ÉP về chính mình và BỎ QUA tham số (không báo lỗi — y như `ownerWhere`,
 * không tiết lộ quán khác có tồn tại hay không).
 *
 * Và "SELF" KHÔNG đồng nghĩa "là quán": kế toán hay người duyệt cũng là SELF mà không có menu nào.
 * Lọc danh mục của họ theo một menu rỗng là làm họ mất sạch món mà không ai hiểu vì sao — nên tài
 * khoản không phải quán thì không lọc gì cả.
 */
export function resolveMenuShopId(user: AuthUser | undefined, requested?: string): string | undefined {
  if (user?.scope === "ALL") return requested || undefined;
  if (!user?.isShop) return undefined;
  return user.id;
}

/**
 * Chặn ghi món không có trong menu của quán. Khuôn y như `assertNoPreparedItems`
 * (modules/posSales/posSales.service.ts): một query, lỗi 400 NÊU TÊN từng món vi phạm — người dùng
 * phải biết bỏ dòng nào, không phải đoán.
 *
 * Chỉ món ĐÃ được gán cho quán khác là vi phạm; món chưa gán quán nào vẫn hợp lệ với mọi quán.
 */
export async function assertItemsInShopMenu(shopUserId: string, finishedGoodItemIds: string[]): Promise<void> {
  const ids = [...new Set(finishedGoodItemIds)];
  if (ids.length === 0) return;

  const offenders = await prisma.finishedGoodItem.findMany({
    where: {
      id: { in: ids },
      shops: { some: {} },
      NOT: { shops: { some: { shopUserId } } },
    },
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  if (offenders.length === 0) return;

  const names = offenders.map((it) => `${it.name} (${it.code})`).join(", ");
  throw new HttpError(
    400,
    `Món không có trong menu của quán: ${names}. Vào Danh mục → Menu theo quán để gán, hoặc bỏ dòng này`,
  );
}

/**
 * Bản dành cho đường SỬA phiếu: chỉ kiểm những món MỚI được thêm vào so với phiếu đã lưu.
 *
 * Kiểm cả phiếu là sai: phiếu lập tháng 3, món bị bỏ khỏi menu tháng 6, thì tháng 7 chỉ sửa số
 * lượng một dòng khác cũng không lưu nổi. Hai sự kiện cách nhau hàng tuần nên không ai nối được
 * nhân quả — người dùng chỉ thấy "tự nhiên không sửa được phiếu cũ".
 */
export async function assertAddedItemsInShopMenu(
  shopUserId: string,
  submittedIds: string[],
  existingIds: string[],
): Promise<void> {
  const existing = new Set(existingIds);
  await assertItemsInShopMenu(
    shopUserId,
    submittedIds.filter((id) => !existing.has(id)),
  );
}

// ---------------------------------------------------------------------------
// Bản song sinh cho HÀNG HOÁ (`ProductShop`). Cùng quy ước "chưa gán = mọi quán thấy", dùng chung
// `resolveMenuShopId` ở trên — một tài khoản đã là quán thì vừa có menu món vừa có danh sách
// nguyên liệu, không có lý gì phân giải quán theo hai luật khác nhau.
// ---------------------------------------------------------------------------

export function productShopWhere(shopUserId: string | undefined): Prisma.ProductWhereInput {
  if (!shopUserId) return {};
  return { OR: [{ shops: { some: { shopUserId } } }, { shops: { none: {} } }] };
}

export async function assertProductsInShopList(shopUserId: string, productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  const offenders = await prisma.product.findMany({
    where: {
      id: { in: ids },
      shops: { some: {} },
      NOT: { shops: { some: { shopUserId } } },
    },
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  if (offenders.length === 0) return;

  const names = offenders.map((it) => `${it.name} (${it.code})`).join(", ");
  throw new HttpError(
    400,
    `Hàng hoá không có ở quán: ${names}. Vào Danh mục → Menu & nguyên liệu theo quán để gán, hoặc bỏ dòng này`,
  );
}

/** Đường SỬA phiếu: chỉ kiểm hàng MỚI thêm — xem lý do ở `assertAddedItemsInShopMenu`. */
export async function assertAddedProductsInShopList(
  shopUserId: string,
  submittedIds: string[],
  existingIds: string[],
): Promise<void> {
  const existing = new Set(existingIds);
  await assertProductsInShopList(
    shopUserId,
    submittedIds.filter((id) => !existing.has(id)),
  );
}

/**
 * Giá bán có hiệu lực HÔM NAY cho một quán, phân giải riêng→chung bằng đúng luật của `PriceHistory`.
 *
 * Dùng cho giá mặc định của phiếu kiểm kê quán: cột mirror `FinishedGoodItem.sellingPrice` mang
 * nghĩa giá của bản CHUNG, nên quán có giá riêng mà vẫn lấy mirror là gõ kiểm kê bằng giá sai.
 *
 * Trả Map chỉ chứa món CÓ mốc giá phân giải được; món không có thì call-site tự lùi về mirror.
 */
export async function resolveEffectiveSellingPrices(
  finishedGoodItemIds: string[],
  shopUserId: string | undefined,
): Promise<Map<string, number>> {
  const ids = [...new Set(finishedGoodItemIds)];
  const out = new Map<string, number>();
  if (ids.length === 0) return out;

  const rows = await prisma.finishedGoodPrice.findMany({
    where: {
      finishedGoodItemId: { in: ids },
      ...(shopUserId ? { OR: [{ shopUserId: null }, { shopUserId }] } : { shopUserId: null }),
      // Mốc tương lai không phải giá hôm nay.
      effectiveFrom: { lte: new Date(vnDayStartMs(new Date())) },
    },
    select: { finishedGoodItemId: true, effectiveFrom: true, sellingPrice: true, shopUserId: true },
    orderBy: { effectiveFrom: "desc" },
  });

  // Mốc RIÊNG thắng mốc chung ở mọi ngày từ mốc riêng đầu tiên trở đi; vì đang tra ĐÚNG hôm nay nên
  // chỉ cần: có mốc riêng nào ≤ hôm nay thì lấy mốc riêng mới nhất, không thì lấy mốc chung mới nhất.
  const own = new Map<string, number>();
  const shared = new Map<string, number>();
  for (const r of rows) {
    const target = r.shopUserId != null ? own : shared;
    if (!target.has(r.finishedGoodItemId)) target.set(r.finishedGoodItemId, Number(r.sellingPrice));
  }
  for (const id of ids) {
    const value = own.get(id) ?? shared.get(id);
    if (value !== undefined) out.set(id, value);
  }
  return out;
}

type ProductShopTx = Pick<Prisma.TransactionClient, "product" | "productShop">;

/**
 * Gán thêm hàng hoá cho một quán — dùng khi hàng THẬT SỰ đã về quán đó, cụ thể là quán NHẬN của
 * phiếu điều chuyển. Hàng đã nằm trong kho quán thì đương nhiên "có ở quán đó".
 *
 * Nếu không làm bước này, điều chuyển sang quán chưa được gán sẽ để lại một trạng thái hỏng: quán
 * đang giữ hàng mà phiếu kiểm không hiện dòng đó, nên Check Cost tính tồn cuối kỳ bằng 0 và
 * `actualUsed` phồng lên bằng cả lượng đang giữ.
 *
 * CHỈ gán cho hàng ĐÃ CÓ danh sách quán. Hàng chưa gán quán nào vốn đã hiện ở MỌI quán — thêm một
 * dòng gán cho quán nhận sẽ THU HẸP nó về đúng quán đó và làm mọi quán khác mất hàng. Đây là mặt
 * ngược của quy ước "chưa gán = mọi quán thấy", và là lý do hàm này phải tra trước khi ghi.
 *
 * Chỉ THÊM, không bao giờ bớt, nên không có nguy cơ nới rộng hay thu hẹp phạm vi ngoài ý muốn.
 */
export async function grantProductsToShop(
  tx: ProductShopTx,
  shopUserId: string,
  productIds: string[],
): Promise<void> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return;

  const constrained = await tx.product.findMany({
    where: { id: { in: ids }, shops: { some: {} } },
    select: { id: true },
  });
  if (constrained.length === 0) return;

  await tx.productShop.createMany({
    data: constrained.map((p) => ({ shopUserId, productId: p.id })),
    skipDuplicates: true,
  });
}
