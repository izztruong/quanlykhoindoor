import { prisma } from "../../config/db";
import { Prisma } from "../../generated/prisma/client";
import { VN_OFFSET_MS } from "../../utils/deadlines";

const DAY_MS = 24 * 60 * 60 * 1000;
const WASTE_WINDOW_DAYS = 7;

/**
 * Đơn "Chưa xác nhận" (DRAFT) — đơn quán vừa đặt, đang chờ admin xác nhận. Không tính
 * PENDING_CONFIRM: đó là đơn admin đã xác nhận xong, đang chờ quán nhận hàng.
 */
export function countUnconfirmedOrders(createdById: string | undefined) {
  return prisma.salesOrder.count({ where: { status: "DRAFT", createdById } });
}

/** Giá vốn của 1 đơn vị công thức (vd gam): costPrice tính theo đơn vị chính, chia hệ số quy đổi. */
function costPerRecipeUnit(product: { costPrice: unknown; recipeUnitsPerBaseUnit: unknown }): number {
  const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
  return Number(product.costPrice) / factor;
}

/**
 * Huỷ hàng trong 7 ngày qua. Phiếu huỷ không lưu giá nên tiền tính theo giá vốn HIỆN TẠI của hàng
 * hoá — đổi giá vốn thì số này đổi theo (người dùng đã chấp nhận). Quy đổi SL giống Check Cost:
 * SL chẵn × hệ số + SL lẻ (đã là đơn vị công thức), đồ thành phẩm đi qua công thức.
 */
export async function getWasteSummary(createdById: string | undefined, now = new Date()) {
  const where: Prisma.MaterialWasteWhereInput = {
    createdById,
    wasteAt: { gte: new Date(now.getTime() - WASTE_WINDOW_DAYS * DAY_MS), lte: now },
  };
  const productSelect = { costPrice: true, recipeUnitsPerBaseUnit: true } as const;

  const [slipCount, items, finishedItems] = await Promise.all([
    prisma.materialWaste.count({ where }),
    prisma.materialWasteItem.findMany({
      where: { materialWaste: where },
      select: { productId: true, wholeQuantity: true, looseQuantity: true, product: { select: productSelect } },
    }),
    prisma.materialWasteFinishedItem.findMany({
      where: { materialWaste: where },
      select: {
        finishedGoodItemId: true,
        quantity: true,
        finishedGoodItem: {
          select: { recipeItems: { select: { quantityPerUnit: true, product: { select: productSelect } } } },
        },
      },
    }),
  ]);

  let value = 0;
  for (const item of items) {
    const factor = item.product.recipeUnitsPerBaseUnit != null ? Number(item.product.recipeUnitsPerBaseUnit) : 1;
    const recipeQty = Number(item.wholeQuantity ?? 0) * factor + Number(item.looseQuantity ?? 0);
    value += recipeQty * costPerRecipeUnit(item.product);
  }
  for (const item of finishedItems) {
    const unitCost = item.finishedGoodItem.recipeItems.reduce(
      (sum, recipe) => sum + Number(recipe.quantityPerUnit) * costPerRecipeUnit(recipe.product),
      0,
    );
    value += Number(item.quantity) * unitCost;
  }

  const itemCount =
    new Set(items.map((item) => item.productId)).size +
    new Set(finishedItems.map((item) => item.finishedGoodItemId)).size;

  return { value, slipCount, itemCount, days: WASTE_WINDOW_DAYS };
}

export interface CostMonth {
  year: number;
  month: number;
  /** Số phiếu Check Cost rơi vào tháng — 0 nghĩa là KHÔNG CÓ số liệu, khác với chi phí bằng 0. */
  checkCount: number;
  cost: number;
  netRevenue: number;
  /** cost / netRevenue, 0 khi doanh thu bằng 0. */
  pct: number;
}

/** Tháng (giờ VN) chứa mốc `date`. */
function vnYearMonth(date: Date) {
  const shifted = new Date(date.getTime() + VN_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** 0h ngày 1 của tháng theo giờ VN. `month` được phép tràn (13 = tháng 1 năm sau). */
function vnMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1) - VN_OFFSET_MS);
}

/**
 * Chi phí NVL theo tháng, cộng từ số đã chốt trong reportSnapshot của phiếu Check Cost ACTIVE.
 * Kỳ Check Cost không trùng tháng dương lịch nên mỗi phiếu được GÁN TRỌN vào tháng của phiếu kiểm
 * chốt kỳ (closingStockCheck.checkedAt, giờ VN). Phiếu tạo trước khi có snapshot (null) bị bỏ qua —
 * snapshot của chúng chỉ được tính khi mở chi tiết lần đầu.
 */
export async function getCostSummary(userId: string | undefined, year: number | undefined, now = new Date()) {
  const current = vnYearMonth(now);
  const chartYear = year ?? current.year;

  // Hai khoảng: cả năm của biểu đồ, và từ đầu năm trước tới hết năm nay cho ô so sánh.
  const ranges = [
    [vnMonthStart(chartYear, 1), vnMonthStart(chartYear + 1, 1)],
    [vnMonthStart(current.year - 1, 1), vnMonthStart(current.year + 1, 1)],
  ];
  const offsetSeconds = VN_OFFSET_MS / 1000;

  const grouped = await prisma.$queryRaw<{ year: number; month: number; checkCount: number; cost: string; netRevenue: string }[]>`
    SELECT
      EXTRACT(YEAR FROM s."checkedAt" + ${offsetSeconds} * interval '1 second')::int AS year,
      EXTRACT(MONTH FROM s."checkedAt" + ${offsetSeconds} * interval '1 second')::int AS month,
      COUNT(*)::int AS "checkCount",
      COALESCE(SUM((c."reportSnapshot"->'summary'->>'actualCostTotalValue')::numeric), 0)::text AS cost,
      COALESCE(SUM((c."reportSnapshot"->'summary'->>'netRevenueTotal')::numeric), 0)::text AS "netRevenue"
    FROM "CostCheck" c
    JOIN "StockCheck" s ON s.id = c."closingStockCheckId"
    WHERE c.status = 'ACTIVE'
      AND c."reportSnapshot" IS NOT NULL
      AND (${Prisma.join(
        ranges.map(([from, to]) => Prisma.sql`(s."checkedAt" >= ${from} AND s."checkedAt" < ${to})`),
        " OR ",
      )})
      ${userId ? Prisma.sql`AND c."userId" = ${userId}` : Prisma.empty}
    GROUP BY 1, 2
  `;

  const byKey = new Map(grouped.map((row) => [`${row.year}-${row.month}`, row]));
  function monthOf(y: number, m: number): CostMonth {
    // Chuẩn hoá tháng tràn (0 = tháng 12 năm trước).
    const normalized = vnYearMonth(new Date(vnMonthStart(y, m).getTime() + DAY_MS));
    const row = byKey.get(`${normalized.year}-${normalized.month}`);
    const cost = Number(row?.cost ?? 0);
    const netRevenue = Number(row?.netRevenue ?? 0);
    return {
      ...normalized,
      checkCount: row?.checkCount ?? 0,
      cost,
      netRevenue,
      pct: netRevenue > 0 ? cost / netRevenue : 0,
    };
  }

  return {
    year: chartYear,
    months: Array.from({ length: 12 }, (_, i) => monthOf(chartYear, i + 1)),
    current: monthOf(current.year, current.month),
    previousMonth: monthOf(current.year, current.month - 1),
    sameMonthLastYear: monthOf(current.year - 1, current.month),
  };
}
