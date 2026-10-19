import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { PriceHistory } from "../../utils/priceHistory";
import { toDateKey, vnDayStartMs } from "../../utils/vnTime";
import {
  computeCostCheckReport,
  costCheckDetailInclude,
  loadBakerySalesForPeriod,
  type BakeryPeriodSales,
  type MaterialRow,
} from "./costChecks.service";
import type { bakeryCostCheckCreateSchema } from "./bakeryCostChecks.schemas";
import type { z } from "zod";

/**
 * Check Cost của TIỆM BÁNH.
 *
 * Đặt trong module `costChecks` chứ không thành module riêng, dù đây là chức năng mới: phiếu của tiệm
 * bánh LÀ một dòng `CostCheck` và dùng lại nguyên `computeCostCheckReport`. Tách module thì phải
 * hoặc chép ~400 dòng tính báo cáo, hoặc gọi service của module khác — điều CLAUDE.md cấm. Giữ cùng
 * module là cách duy nhất không vi phạm cái nào.
 *
 * Khác phiếu của quán đúng hai chỗ:
 *  1. Trục bán ra là `BakerySale` thay cho `PosSaleHour` (`loadBakerySalesForPeriod`).
 *  2. Khối tổng hợp tài chính viết riêng: nhãn của quán (NVL Trà · ĐAV · cốc & ống hút) không có
 *     nghĩa ở đây, và doanh thu là GIÁ XUẤT.
 */

type BakeryCostCheckCreateInput = z.infer<typeof bakeryCostCheckCreateSchema>;

/** Doanh thu bánh bán ra, tách theo người mua. `shopUserId = null` = bán ngoài. */
export interface BakeryRevenueByBuyer {
  shopUserId: string | null;
  shopName: string;
  quantity: number;
  revenue: number;
}

export interface BakeryFinancialSummary {
  revenue: number;
  revenueByBuyer: BakeryRevenueByBuyer[];
  /** SL bánh bán ra theo từng bánh, để bảng chi tiết khỏi phải tra lại. */
  soldQuantity: number;
  /** Chi phí nguyên liệu ĐÁNG LẼ dùng theo công thức. */
  expectedMaterial: number;
  /** Chi phí nguyên liệu THỰC dùng, suy từ tồn đầu/cuối + nhập + huỷ + điều chuyển. */
  actualMaterial: number;
  /** Giá trị nguyên liệu đã huỷ (đã nằm trong `actualMaterial` hay không tuỳ ô "Trừ CC" của phiếu huỷ). */
  wasteMaterial: number;
  /** actual − expected. Dương = dùng nhiều hơn định mức. */
  variance: number;
  expectedMaterialPct: number;
  actualMaterialPct: number;
  variancePct: number;
  wasteMaterialPct: number;
}

/**
 * Loại hàng hoá được tính vào chi phí của tiệm bánh. `DUNG_CU`/`KHAC` bỏ ra, cùng luật với Check Cost
 * của quán — dụng cụ không phải nguyên liệu làm ra cái bánh.
 */
const COSTED_TYPES = new Set(["NVL", "COC_TAKE", "BANH"]);

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/**
 * Khối tổng hợp riêng của tiệm bánh.
 *
 * Doanh thu = Σ (SL bán ra × giá có hiệu lực NGÀY BÁN đó, theo mốc giá RIÊNG của tiệm bánh). Gộp cả
 * bán cho quán lẫn bán ngoài vì một giá cho mọi người mua.
 *
 * KHÔNG chép cái cổng `category !== "TRA" && category !== "DAV"` của khối tổng hợp bên quán: bánh có
 * `category` gì cũng phải vào doanh thu của tiệm bánh.
 */
export async function computeBakerySummary(
  bakeryUserId: string,
  rows: MaterialRow[],
  sales: BakeryPeriodSales,
): Promise<BakeryFinancialSummary> {
  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    select: { id: true, costPrice: true, recipeUnitsPerBaseUnit: true },
  });
  const costByProduct = new Map(
    products.map((p) => {
      const factor = p.recipeUnitsPerBaseUnit != null ? Number(p.recipeUnitsPerBaseUnit) : 1;
      return [p.id, Number(p.costPrice) / (factor || 1)];
    }),
  );

  let expectedMaterial = 0;
  let actualMaterial = 0;
  let wasteMaterial = 0;
  for (const row of rows) {
    if (!COSTED_TYPES.has(row.productType)) continue;
    const cost = costByProduct.get(row.productId) ?? 0;
    expectedMaterial += row.theoretical * cost;
    actualMaterial += row.actualUsed * cost;
    wasteMaterial += row.wastedQty * cost;
  }

  const prices = await PriceHistory.load(sales.byItem.keys(), bakeryUserId);
  const buyers = new Map<string, BakeryRevenueByBuyer>();
  let revenue = 0;
  let soldQuantity = 0;
  for (const cell of sales.bakeryCells) {
    const value =
      cell.quantity * prices.priceOnDay(cell.finishedGoodItemId, toDateKey(cell.soldOn), vnDayStartMs(cell.soldOn));
    revenue += value;
    soldQuantity += cell.quantity;

    const key = cell.shopUserId ?? "";
    const entry = buyers.get(key) ?? { shopUserId: cell.shopUserId, shopName: "", quantity: 0, revenue: 0 };
    entry.quantity += cell.quantity;
    entry.revenue += value;
    buyers.set(key, entry);
  }

  const shopIds = [...buyers.values()].map((b) => b.shopUserId).filter((id): id is string => id != null);
  const shops = shopIds.length
    ? await prisma.user.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true } })
    : [];
  const shopNameById = new Map(shops.map((s) => [s.id, s.name]));
  for (const entry of buyers.values()) {
    entry.shopName = entry.shopUserId ? (shopNameById.get(entry.shopUserId) ?? "(quán đã xoá)") : "Bán ngoài";
  }

  const variance = actualMaterial - expectedMaterial;
  return {
    revenue,
    revenueByBuyer: [...buyers.values()].sort((a, b) => b.revenue - a.revenue),
    soldQuantity,
    expectedMaterial,
    actualMaterial,
    wasteMaterial,
    variance,
    expectedMaterialPct: safeDiv(expectedMaterial, revenue),
    actualMaterialPct: safeDiv(actualMaterial, revenue),
    variancePct: safeDiv(variance, revenue),
    wasteMaterialPct: safeDiv(wasteMaterial, revenue),
  };
}

/**
 * Lập phiếu Check Cost cho tiệm bánh. Khuôn `createCostCheck`, thay chốt POS bằng chốt `BakerySale`.
 */
export async function createBakeryCostCheck(data: BakeryCostCheckCreateInput, actingUser?: AuthUser) {
  const bakery = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { name: true, role: { select: { isBakery: true } } },
  });
  if (!bakery) throw new HttpError(404, "Không tìm thấy tiệm bánh");
  if (!bakery.role.isBakery) {
    throw new HttpError(400, `${bakery.name} không phải tiệm bánh. Vào Quản trị › Vai trò, tick "là tiệm bánh".`);
  }

  const [opening, closing] = await Promise.all([
    prisma.stockCheck.findUnique({ where: { id: data.openingStockCheckId } }),
    prisma.stockCheck.findUnique({ where: { id: data.closingStockCheckId } }),
  ]);
  if (!opening || !closing) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê đầu/cuối kỳ");
  if (opening.createdById !== data.userId || closing.createdById !== data.userId) {
    throw new HttpError(400, "Phiếu kiểm kê đầu/cuối kỳ phải cùng thuộc tiệm bánh được chọn");
  }
  if (opening.checkedAt >= closing.checkedAt) {
    throw new HttpError(400, "Phiếu kiểm kê đầu kỳ phải có thời gian trước phiếu cuối kỳ");
  }

  // Cùng lý do như phiếu của quán: không có kho thì cột "Nhận trong kỳ" bằng 0 vĩnh viễn mà không có
  // dấu hiệu gì.
  const warehouse = await prisma.warehouse.findUnique({ where: { shopUserId: data.userId }, select: { id: true } });
  if (!warehouse) {
    throw new HttpError(
      409,
      `${bakery.name} chưa có kho riêng nên không tính được nguyên liệu nhập trong kỳ. ` +
        `Vào Danh mục › Kho hàng, tạo kho và chọn tiệm bánh này ở ô "Quán", rồi tạo lại phiếu.`,
    );
  }

  // Đọc trục bán ra MỘT LẦN rồi dùng cho cả bảng `CostCheckSoldItem` lẫn báo cáo — cùng lý do như
  // phiếu của quán: hai lượt đọc riêng thì một lần nhập chen vào giữa làm hai bên chốt lệch nhau.
  const sales = await loadBakerySalesForPeriod(data.userId, opening, closing);
  if (sales.bakeryCells.length === 0) {
    throw new HttpError(
      409,
      `${bakery.name} chưa có dòng bánh bán ra nào trong kỳ này. ` +
        `Vào Quản trị › Bánh bán ra để nhập, rồi tạo lại phiếu.`,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const costCheck = await tx.costCheck.create({
      data: {
        code: generateCode("CC"),
        userId: data.userId,
        openingStockCheckId: data.openingStockCheckId,
        closingStockCheckId: data.closingStockCheckId,
        note: data.note,
        createdById: actingUser?.id,
      },
    });

    await tx.costCheckSoldItem.createMany({
      data: [...sales.byItem].map(([finishedGoodItemId, quantitySold]) => ({
        costCheckId: costCheck.id,
        finishedGoodItemId,
        quantitySold,
      })),
    });

    return tx.costCheck.findUniqueOrThrow({ where: { id: costCheck.id }, include: costCheckDetailInclude });
  });

  // Phải chạy SAU khi transaction commit — computeCostCheckReport đọc lại qua prisma thường.
  const { rows } = await computeCostCheckReport(created.id, sales);
  const summary = await computeBakerySummary(data.userId, rows, sales);

  const { reportSnapshot: _reportSnapshot, ...withSnapshot } = await prisma.costCheck.update({
    where: { id: created.id },
    data: {
      reportSnapshot: { rows, summary, posCoverage: sales.coverage, kind: "BAKERY" } as unknown as Prisma.InputJsonValue,
    },
    include: costCheckDetailInclude,
  });

  return { ...withSnapshot, report: rows, bakerySummary: summary, posCoverage: sales.coverage };
}
