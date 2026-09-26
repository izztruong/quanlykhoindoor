import { prisma } from "../../config/db";
import { declaredStockKey, getLatestDeclaredStock } from "../../utils/declaredStock";
import { DEFAULT_COVER_DAYS, pickPrioritySupplier } from "../../utils/orderCadence";
import { getDailyUsage } from "../reorderSuggestions/reorderSuggestions.service";
import { getInventoryCountReport } from "../reports/reports.service";

/**
 * Hàng MUA TẬP TRUNG: cốc giấy và những thứ tương tự, quyết ở mức chuỗi chứ không mức quán.
 *
 * Vì sao không nằm trong Order nhanh của quán: SL đặt tối thiểu 10.000 cái không phải của một quán
 * (quán đặt 900–4.000 cái/lần), và câu hỏi "còn đủ dùng bao nhiêu ngày" phải tính trên tồn CẢ CHUỖI —
 * kho trung tâm cộng tồn của từng quán. Một quán nhìn vào số của mình sẽ luôn thấy cần gọi.
 *
 * Điểm đặt hàng cổ điển: gọi khi lượng còn lại vừa đủ cầm cự tới lúc lô mới về, tức khi
 * `còn đủ < leadDays`. Không thêm cột ngưỡng riêng — `Product.leadDays` vừa là thời gian chờ vừa là
 * ngưỡng, và `ProductSupplierPrice.minQuantity` đã là SL đặt tối thiểu của NCC.
 */

/** Tồn một quán khai, kèm số đó CŨ BAO NHIÊU — số ba tuần trước làm câu "còn đủ 20 ngày" thành vô nghĩa. */
export interface ShopStock {
  userId: string;
  userName: string;
  quantity: number;
  /** Mốc khai. Null = quán chưa từng khai tồn hàng này ở đâu cả. */
  declaredAt: Date | null;
  source: "REORDER_RUN" | "STOCK_CHECK" | "NONE";
  /** Số ngày kể từ lúc khai, làm tròn xuống. Null khi chưa có số nào. */
  ageDays: number | null;
}

export interface CentralPurchasingRow {
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  productGroupName: string;
  /** Vừa là thời gian chờ hàng vừa là NGƯỠNG GỌI. Null = chưa khai, không kết luận được. */
  leadDays: number | null;
  warehouseQty: number;
  shopQty: number;
  chainQty: number;
  shopStocks: ShopStock[];
  /** Tổng mức dùng mỗi ngày của MỌI quán. Null = không quán nào đủ dữ liệu. */
  dailyUsage: number | null;
  /** Số ngày tồn chuỗi còn cầm cự được. Null khi chưa biết mức dùng. */
  coverDays: number | null;
  needsOrder: boolean;
  /** NCC ưu tiên và SL đặt của NCC đó — cùng cách chọn với Tổng hợp đặt NCC. */
  prioritySupplierName: string | null;
  purchaseUnitName: string | null;
  baseUnitsPerPurchaseUnit: number | null;
  minQuantity: number | null;
  /** SL nên đặt, theo đơn vị gọi của NCC (đã làm tròn lên thùng rồi lên SL tối thiểu). */
  purchaseQty: number;
  /** Cùng số đó quy về đơn vị chính, để đối chiếu với tồn. */
  finalBaseQty: number;
  /** Số khai CŨ NHẤT trong các quán — con số quyết định độ tin của cả dòng. */
  oldestShopStockAgeDays: number | null;
  /** Số quán chưa khai tồn hàng này lần nào. */
  shopsWithoutStock: number;
  reasons: string[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function ageInDays(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Tồn từng quán khai gần nhất, bọc `utils/declaredStock` thành dạng dòng của màn này.
 *
 * Phép chọn "bản mới hơn giữa lượt gợi ý và phiếu kiểm" nằm trong util đó, KHÔNG viết lại ở đây: tồn
 * ước tính hàng ngày cũng neo vào chính con số ấy, và hai bản sao lệch nhau thì hai màn sẽ nói hai điều
 * khác nhau về cùng một quán.
 */
async function getShopStocks(
  shops: { id: string; name: string }[],
  productIds: string[],
  now: Date,
): Promise<Map<string, ShopStock[]>> {
  const declared = await getLatestDeclaredStock(
    shops.map((s) => s.id),
    productIds,
  );

  const byProduct = new Map<string, ShopStock[]>();
  for (const productId of productIds) {
    byProduct.set(
      productId,
      shops.map((shop) => {
        const pick = declared.get(declaredStockKey(shop.id, productId));
        return {
          userId: shop.id,
          userName: shop.name,
          quantity: pick ? pick.quantity : 0,
          declaredAt: pick?.at ?? null,
          source: pick?.source ?? "NONE",
          ageDays: pick ? ageInDays(pick.at, now) : null,
        };
      }),
    );
  }
  return byProduct;
}

export async function getCentralPurchasingReport(now: Date = new Date()): Promise<CentralPurchasingRow[]> {
  const products = await prisma.product.findMany({
    where: { orderCadence: "CENTRAL", active: true },
    include: { unit: true, productGroup: true },
    orderBy: { name: "asc" },
  });
  if (products.length === 0) return [];
  const productIds = products.map((p) => p.id);

  const [warehouses, shops, prices] = await Promise.all([
    prisma.warehouse.findMany({ select: { id: true } }),
    // Quán = tài khoản thuộc vai trò có cờ isShop, cùng định nghĩa với `?scope=shop` của /api/users.
    prisma.user.findMany({ where: { role: { isShop: true } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.productSupplierPrice.findMany({
      where: { productId: { in: productIds } },
      include: { supplier: true, purchaseUnit: true },
    }),
  ]);

  // Tồn kho trung tâm: cộng qua MỌI kho. Dùng `systemQty` với kỳ rỗng (periodStart = periodEnd = now)
  // đúng như `/api/product-stock` — tức tồn sổ sách luỹ kế tới bây giờ.
  const warehouseQty = new Map<string, number>();
  for (const warehouse of warehouses) {
    const { items } = await getInventoryCountReport({ warehouseId: warehouse.id, periodStart: now, periodEnd: now });
    for (const item of items) {
      if (!productIds.includes(item.product.id)) continue;
      warehouseQty.set(item.product.id, (warehouseQty.get(item.product.id) ?? 0) + item.systemQty);
    }
  }

  const [shopStocksByProduct, usageByShop] = await Promise.all([
    getShopStocks(shops, productIds, now),
    Promise.all(shops.map(async (shop) => ({ shop, usage: await getDailyUsage(shop.id, productIds) }))),
  ]);

  const pricesByProduct = new Map<string, typeof prices>();
  for (const price of prices) {
    const list = pricesByProduct.get(price.productId) ?? [];
    list.push(price);
    pricesByProduct.set(price.productId, list);
  }

  return products.map((product) => {
    const shopStocks = shopStocksByProduct.get(product.id) ?? [];
    const shopQty = round3(shopStocks.reduce((sum, s) => sum + s.quantity, 0));
    const warehouse = round3(warehouseQty.get(product.id) ?? 0);
    const chainQty = round3(warehouse + shopQty);

    // Mức dùng của chuỗi = cộng mức dùng của từng quán. Quán nào không đủ dữ liệu thì bỏ qua, và nói rõ
    // là đã bỏ qua mấy quán — tổng thiếu một quán sẽ làm "còn đủ" cao hơn thực tế, tức gọi muộn.
    const usable = usageByShop.filter((u) => u.usage.get(product.id)?.dailyUsage != null);
    const dailyUsage =
      usable.length > 0 ? round3(usable.reduce((sum, u) => sum + u.usage.get(product.id)!.dailyUsage!, 0)) : null;

    const { supplier: best, chosenForCredit } = pickPrioritySupplier(
      (pricesByProduct.get(product.id) ?? []).map((p) => ({ ...p, supplierName: p.supplier.name })),
    );
    const packSize = Number(best?.baseUnitsPerPurchaseUnit ?? 0);
    const hasPurchaseUnit = Boolean(best?.purchaseUnit && packSize > 0);
    const minQuantity = best?.minQuantity == null ? null : Number(best.minQuantity);

    const coverDays = dailyUsage != null && dailyUsage > 0 ? round3(chainQty / dailyUsage) : null;
    const threshold = product.leadDays;
    const needsOrder = coverDays != null && threshold != null && coverDays < threshold;

    // SL đặt: phủ từ bây giờ tới hết thời gian chờ, cộng thêm đúng ngưỡng để lô mới về là tồn quay lại
    // mức an toàn. Rồi làm tròn lên hai bước như Tổng hợp đặt NCC.
    const targetDays = threshold != null ? threshold * 2 : DEFAULT_COVER_DAYS;
    const neededBase = dailyUsage != null ? Math.max(0, dailyUsage * targetDays - chainQty) : 0;
    const rawQty = hasPurchaseUnit ? neededBase / packSize : neededBase;
    const packedQty = hasPurchaseUnit ? Math.ceil(rawQty) : round3(rawQty);
    const purchaseQty = needsOrder ? (minQuantity != null ? Math.max(packedQty, minQuantity) : packedQty) : 0;
    const finalBaseQty = round3(hasPurchaseUnit ? purchaseQty * packSize : purchaseQty);

    const ages = shopStocks.map((s) => s.ageDays).filter((a): a is number => a != null);
    const reasons: string[] = [];

    reasons.push(
      `Tồn chuỗi ${warehouse} (kho) + ${shopQty} (${shops.length} quán) = ${chainQty} ${product.unit?.name ?? ""}`.trim(),
    );
    // Tồn kho sổ sách âm = xuất nhiều hơn nhập trên giấy. Không sửa và không kẹp về 0: kẹp lên 0 làm tồn
    // chuỗi CAO hơn thực tế, tức gọi muộn và hết hàng. Nhưng phải nói ra, vì một số âm lẫn vào phép cộng
    // sẽ bị cho là lỗi của màn này chứ không phải của phiếu nhập/xuất.
    if (warehouse < 0) {
      reasons.push(
        `Tồn kho sổ sách ÂM (${warehouse}) — kho xuất nhiều hơn nhập trên phiếu. Số "tồn chuỗi" đang thấp hơn thực tế, cần soát lại phiếu nhập/xuất của hàng này`,
      );
    }
    if (dailyUsage == null) {
      reasons.push("Không quán nào đủ dữ liệu tiêu thụ — chưa kết luận được, phải xem tay");
    } else {
      reasons.push(`Mức dùng toàn chuỗi ${dailyUsage}/ngày (${usable.length}/${shops.length} quán có dữ liệu)`);
      // Lệch cơ sở tính: tồn cộng đủ mọi quán, còn mức dùng chỉ cộng quán có dữ liệu. Thiếu quán nào thì
      // mức dùng thấp hơn thực tế → "còn đủ" dài hơn thực tế → gọi muộn. Đây là hướng sai nguy hiểm.
      if (usable.length < shops.length) {
        reasons.push(
          `${shops.length - usable.length} quán chưa có dữ liệu tiêu thụ nên KHÔNG góp vào mức dùng — số "còn đủ" đang LẠC QUAN hơn thực tế`,
        );
      }
      if (coverDays != null) reasons.push(`Còn đủ dùng ${coverDays} ngày`);
    }
    if (threshold == null) {
      reasons.push("Chưa khai số ngày chờ hàng ở Danh mục › Hàng hoá — không có ngưỡng để so");
    } else if (needsOrder) {
      reasons.push(`Còn đủ dưới ${threshold} ngày chờ hàng — PHẢI GỌI ngay`);
      reasons.push(`Đặt đủ dùng ${targetDays} ngày (2 × chờ hàng) trừ tồn chuỗi = ${round3(neededBase)}`);
      if (minQuantity != null && purchaseQty > packedQty) {
        reasons.push(`Nâng lên SL đặt tối thiểu của ${best?.supplier.name}: ${minQuantity}`);
      }
    } else if (coverDays != null) {
      reasons.push(`Còn trên ${threshold} ngày chờ hàng — chưa cần gọi`);
    }
    if (best == null) reasons.push("Chưa khai NCC nào cho hàng này — không biết SL đặt tối thiểu");
    else if (chosenForCredit) {
      reasons.push(`Đã chọn ${best.supplier.name} dù giá nhập cao hơn một chút, vì NCC này cho công nợ`);
    }

    const oldest = ages.length > 0 ? Math.max(...ages) : null;
    if (oldest != null && oldest > 7) {
      reasons.push(`Tồn quán cũ nhất khai cách đây ${oldest} ngày — con số "còn đủ" chỉ đáng tin tới mức đó`);
    }
    const shopsWithoutStock = shopStocks.filter((s) => s.source === "NONE").length;
    if (shopsWithoutStock > 0) {
      reasons.push(`${shopsWithoutStock} quán chưa khai tồn hàng này lần nào — đang tính là 0`);
    }

    return {
      productId: product.id,
      code: product.code,
      name: product.name,
      unitLabel: product.unit?.name ?? "-",
      productGroupName: product.productGroup?.name ?? "Chưa phân nhóm",
      leadDays: threshold,
      warehouseQty: warehouse,
      shopQty,
      chainQty,
      shopStocks,
      dailyUsage,
      coverDays,
      needsOrder,
      prioritySupplierName: best?.supplier.name ?? null,
      purchaseUnitName: hasPurchaseUnit ? (best!.purchaseUnit?.name ?? null) : null,
      baseUnitsPerPurchaseUnit: hasPurchaseUnit ? packSize : null,
      minQuantity,
      purchaseQty,
      finalBaseQty,
      oldestShopStockAgeDays: oldest,
      shopsWithoutStock,
      reasons,
    };
  });
}
