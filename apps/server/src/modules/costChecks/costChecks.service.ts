import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import type { z } from "zod";
import type { costCheckCreateSchema } from "./costChecks.schemas";

type CostCheckCreateInput = z.infer<typeof costCheckCreateSchema>;

export const costCheckListInclude = {
  user: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  openingStockCheck: { select: { id: true, code: true, checkedAt: true } },
  closingStockCheck: { select: { id: true, code: true, checkedAt: true } },
};

export const costCheckDetailInclude = {
  ...costCheckListInclude,
  soldItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

export async function createCostCheck(data: CostCheckCreateInput, actingUser?: AuthUser) {
  const [opening, closing] = await Promise.all([
    prisma.stockCheck.findUnique({ where: { id: data.openingStockCheckId } }),
    prisma.stockCheck.findUnique({ where: { id: data.closingStockCheckId } }),
  ]);
  if (!opening || !closing) throw new HttpError(404, "Không tìm thấy phiếu kiểm kê đầu/cuối kỳ");
  if (opening.createdById !== data.userId || closing.createdById !== data.userId) {
    throw new HttpError(400, "Phiếu kiểm kê đầu/cuối kỳ phải cùng thuộc quán được chọn");
  }
  if (opening.checkedAt >= closing.checkedAt) {
    throw new HttpError(400, "Phiếu kiểm kê đầu kỳ phải có thời gian trước phiếu cuối kỳ");
  }

  const created = await prisma.$transaction(async (tx) => {
    const costCheck = await tx.costCheck.create({
      data: {
        code: generateCode("CC"),
        userId: data.userId,
        openingStockCheckId: data.openingStockCheckId,
        closingStockCheckId: data.closingStockCheckId,
        note: data.note,
        discountTra: data.discountTra,
        discountDav: data.discountDav,
        createdById: actingUser?.id,
      },
    });

    await tx.costCheckSoldItem.createMany({
      data: data.soldItems.map((it) => ({
        costCheckId: costCheck.id,
        finishedGoodItemId: it.finishedGoodItemId,
        quantitySold: it.quantitySold,
      })),
    });

    return tx.costCheck.findUniqueOrThrow({ where: { id: costCheck.id }, include: costCheckDetailInclude });
  });

  // Chốt cứng báo cáo ngay lúc tạo phiếu — phải chạy sau khi transaction ở trên đã
  // commit (computeCostCheckReport đọc lại qua prisma thường, không thấy được dữ
  // liệu chưa commit trong tx). Sửa giá vốn/giá bán/công thức sau này sẽ không làm
  // đổi số liệu của phiếu đã tạo.
  const { rows, summary } = await computeCostCheckReport(created.id);
  const { reportSnapshot: _reportSnapshot, ...withSnapshot } = await prisma.costCheck.update({
    where: { id: created.id },
    data: { reportSnapshot: { rows, summary } as unknown as Prisma.InputJsonValue },
    include: costCheckDetailInclude,
  });

  return { ...withSnapshot, report: rows, financialSummary: summary };
}

export interface MaterialRow {
  productId: string;
  code: string;
  name: string;
  unitLabel: string;
  openingQty: number;
  // Đã gộp cả "nhận từ kho" (SalesOrder) lẫn "nhận điều chuyển" (MaterialTransfer đến) — 2 nguồn
  // này cùng ý nghĩa "hàng về trong kỳ" nên hiển thị chung 1 cột.
  receivedQty: number;
  transferOutQty: number;
  wastedQty: number;
  closingQty: number;
  actualUsed: number;
  theoretical: number;
  variance: number;
}

export interface FinancialSummary {
  revenueTra: number;
  revenueDav: number;
  revenueTotal: number;
  discountTra: number;
  discountDav: number;
  discountTotal: number;
  netRevenueTra: number;
  netRevenueDav: number;
  netRevenueTotal: number;
  expectedNvlTra: number;
  expectedNvlTraPct: number;
  expectedDav: number;
  expectedDavPct: number;
  actualNvlTra: number;
  actualNvlTraPct: number;
  actualDav: number;
  actualDavPct: number;
  cupsStraws: number;
  cupsStrawsPct: number;
  actualCostTraValue: number;
  actualCostTraPct: number;
  actualCostTotalValue: number;
  actualCostTotalPct: number;
  wasteNvlValue: number;
  wasteNvlPct: number;
}

/** wholeQuantity (theo đơn vị chính) quy đổi sang recipeUnitName qua factor, cộng với looseQuantity (đã luôn tính bằng recipeUnitName). */
function toRecipeUnit(factor: number, wholeQuantity: unknown, looseQuantity: unknown): number {
  return Number(wholeQuantity ?? 0) * factor + Number(looseQuantity ?? 0);
}

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

/**
 * Tính báo cáo Check Cost: với mỗi nguyên liệu, so sánh lượng thực tế đã dùng
 * (tồn đầu kỳ + nhận trong kỳ + nhận điều chuyển đến − huỷ − điều chuyển đi −
 * tồn cuối kỳ, trong đó tồn đầu/cuối kỳ đã cộng cả phần "đang nằm" ở đồ thành
 * phẩm/món tồn kho, quy đổi qua công thức) với lượng đáng lẽ phải dùng theo
 * công thức (từ SL đồ thành phẩm/món đã bán).
 */
export async function computeCostCheckReport(costCheckId: string): Promise<{ rows: MaterialRow[]; summary: FinancialSummary }> {
  const costCheck = await prisma.costCheck.findUnique({
    where: { id: costCheckId },
    include: {
      soldItems: { include: { finishedGoodItem: true } },
      openingStockCheck: { include: { items: true, finishedItems: true } },
      closingStockCheck: { include: { items: true, finishedItems: true } },
    },
  });
  if (!costCheck) throw new HttpError(404, "Không tìm thấy phiếu Check Cost");

  const { openingStockCheck: opening, closingStockCheck: closing } = costCheck;

  const receivedGroups = await prisma.salesOrderItem.groupBy({
    by: ["productId"],
    where: {
      salesOrder: {
        createdById: costCheck.userId,
        completedAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
    _sum: { receivedQuantity: true },
  });

  const wasteItems = await prisma.materialWasteItem.findMany({
    where: {
      materialWaste: {
        createdById: costCheck.userId,
        wasteAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
  });

  const wasteFinishedItems = await prisma.materialWasteFinishedItem.findMany({
    where: {
      materialWaste: {
        createdById: costCheck.userId,
        wasteAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
  });

  const transferInItems = await prisma.materialTransferItem.findMany({
    where: {
      materialTransfer: {
        toUserId: costCheck.userId,
        transferAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
  });

  const transferOutItems = await prisma.materialTransferItem.findMany({
    where: {
      materialTransfer: {
        fromUserId: costCheck.userId,
        transferAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
  });

  const finishedGoodItemIds = new Set<string>([
    ...opening.finishedItems.map((it) => it.finishedGoodItemId),
    ...closing.finishedItems.map((it) => it.finishedGoodItemId),
    ...wasteFinishedItems.map((it) => it.finishedGoodItemId),
    ...costCheck.soldItems.map((it) => it.finishedGoodItemId),
  ]);

  const recipeItems = await prisma.finishedGoodRecipeItem.findMany({
    where: { finishedGoodItemId: { in: [...finishedGoodItemIds] } },
  });
  // key: `${finishedGoodItemId}:${productId}`
  const recipeByKey = new Map(recipeItems.map((r) => [`${r.finishedGoodItemId}:${r.productId}`, Number(r.quantityPerUnit)]));

  const productIds = new Set<string>([
    ...opening.items.map((it) => it.productId),
    ...closing.items.map((it) => it.productId),
    ...receivedGroups.map((r) => r.productId),
    ...wasteItems.map((it) => it.productId),
    ...transferInItems.map((it) => it.productId),
    ...transferOutItems.map((it) => it.productId),
    ...recipeItems.map((r) => r.productId),
  ]);

  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    include: { unit: true, recipeUnit: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const openingByProduct = new Map(opening.items.map((it) => [it.productId, it]));
  const closingByProduct = new Map(closing.items.map((it) => [it.productId, it]));
  const receivedByProduct = new Map(receivedGroups.map((r) => [r.productId, Number(r._sum.receivedQuantity ?? 0)]));
  const wasteByProduct = new Map<string, { wholeQuantity: unknown; looseQuantity: unknown }[]>();
  for (const it of wasteItems) {
    const list = wasteByProduct.get(it.productId) ?? [];
    list.push(it);
    wasteByProduct.set(it.productId, list);
  }

  function groupByProduct(list: { productId: string; wholeQuantity: unknown; looseQuantity: unknown }[]) {
    const map = new Map<string, { wholeQuantity: unknown; looseQuantity: unknown }[]>();
    for (const it of list) {
      const items = map.get(it.productId) ?? [];
      items.push(it);
      map.set(it.productId, items);
    }
    return map;
  }
  const transferInByProduct = groupByProduct(transferInItems);
  const transferOutByProduct = groupByProduct(transferOutItems);

  const rows: MaterialRow[] = [];
  for (const productId of productIds) {
    const product = productById.get(productId);
    if (!product) continue;
    const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;

    const openingItem = openingByProduct.get(productId);
    const closingItem = closingByProduct.get(productId);
    const openingRaw = openingItem ? toRecipeUnit(factor, openingItem.wholeQuantity, openingItem.looseQuantity) : 0;
    const closingRaw = closingItem ? toRecipeUnit(factor, closingItem.wholeQuantity, closingItem.looseQuantity) : 0;

    const openingFg = opening.finishedItems.reduce((sum, it) => {
      const perUnit = recipeByKey.get(`${it.finishedGoodItemId}:${productId}`);
      return perUnit ? sum + Number(it.quantity) * perUnit : sum;
    }, 0);
    const closingFg = closing.finishedItems.reduce((sum, it) => {
      const perUnit = recipeByKey.get(`${it.finishedGoodItemId}:${productId}`);
      return perUnit ? sum + Number(it.quantity) * perUnit : sum;
    }, 0);

    const receivedRaw = (receivedByProduct.get(productId) ?? 0) * factor;
    const wastedRaw = (wasteByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );
    const wastedFg = wasteFinishedItems.reduce((sum, it) => {
      const perUnit = recipeByKey.get(`${it.finishedGoodItemId}:${productId}`);
      return perUnit ? sum + Number(it.quantity) * perUnit : sum;
    }, 0);
    const wasted = wastedRaw + wastedFg;

    const transferInRaw = (transferInByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );
    const transferOutRaw = (transferOutByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );

    const theoretical = costCheck.soldItems.reduce((sum, it) => {
      const perUnit = recipeByKey.get(`${it.finishedGoodItemId}:${productId}`);
      return perUnit ? sum + Number(it.quantitySold) * perUnit : sum;
    }, 0);

    const received = receivedRaw + transferInRaw;
    const openingQty = openingRaw + openingFg;
    const closingQty = closingRaw + closingFg;
    const actualUsed = openingQty + received - wasted - transferOutRaw - closingQty;

    rows.push({
      productId,
      code: product.code,
      name: product.name,
      unitLabel: product.recipeUnit?.name ?? product.unit.name,
      openingQty,
      receivedQty: received,
      transferOutQty: transferOutRaw,
      wastedQty: wasted,
      closingQty,
      actualUsed,
      theoretical,
      variance: actualUsed - theoretical,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  // Chi phí quy ra tiền, gộp theo Loại hàng hoá: NVL -> chi phí NVL Trà, COC_TAKE -> cốc &
  // ống hút, BANH -> chi phí ĐAV (qua công thức 1 dòng trỏ tới đúng hàng hoá Bánh đó).
  // DUNG_CU/KHAC không tính vào Check Cost.
  let expectedNvlTra = 0;
  let actualNvlTra = 0;
  let wasteNvlValue = 0;
  let cupsStraws = 0;
  let expectedDav = 0;
  let actualDav = 0;
  for (const row of rows) {
    const product = productById.get(row.productId);
    if (!product) continue;
    const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
    const costPerRecipeUnit = Number(product.costPrice) / factor;

    if (product.type === "NVL") {
      expectedNvlTra += row.theoretical * costPerRecipeUnit;
      actualNvlTra += row.actualUsed * costPerRecipeUnit;
      wasteNvlValue += row.wastedQty * costPerRecipeUnit;
    } else if (product.type === "COC_TAKE") {
      cupsStraws += row.actualUsed * costPerRecipeUnit;
    } else if (product.type === "BANH") {
      expectedDav += row.theoretical * costPerRecipeUnit;
      actualDav += row.actualUsed * costPerRecipeUnit;
    }
  }

  let revenueTra = 0;
  let revenueDav = 0;
  for (const soldItem of costCheck.soldItems) {
    const fg = soldItem.finishedGoodItem;
    const value = Number(soldItem.quantitySold) * Number(fg.sellingPrice ?? 0);
    if (fg.category === "TRA") revenueTra += value;
    else if (fg.category === "DAV") revenueDav += value;
  }

  const discountTra = Number(costCheck.discountTra ?? 0);
  const discountDav = Number(costCheck.discountDav ?? 0);
  const netRevenueTra = revenueTra - discountTra;
  const netRevenueDav = revenueDav - discountDav;
  const actualCostTraValue = actualNvlTra + cupsStraws;
  const actualCostTotalValue = actualNvlTra + cupsStraws + actualDav;

  const summary: FinancialSummary = {
    revenueTra,
    revenueDav,
    revenueTotal: revenueTra + revenueDav,
    discountTra,
    discountDav,
    discountTotal: discountTra + discountDav,
    netRevenueTra,
    netRevenueDav,
    netRevenueTotal: netRevenueTra + netRevenueDav,
    expectedNvlTra,
    expectedNvlTraPct: safeDiv(expectedNvlTra, netRevenueTra),
    expectedDav,
    expectedDavPct: safeDiv(expectedDav, netRevenueDav),
    actualNvlTra,
    actualNvlTraPct: safeDiv(actualNvlTra, netRevenueTra),
    actualDav,
    actualDavPct: safeDiv(actualDav, netRevenueDav),
    cupsStraws,
    cupsStrawsPct: safeDiv(cupsStraws, netRevenueTra),
    actualCostTraValue,
    actualCostTraPct: safeDiv(actualCostTraValue, netRevenueTra),
    actualCostTotalValue,
    actualCostTotalPct: safeDiv(actualCostTotalValue, netRevenueTra + netRevenueDav),
    wasteNvlValue,
    wasteNvlPct: safeDiv(wasteNvlValue, netRevenueTra),
  };

  return { rows, summary };
}
