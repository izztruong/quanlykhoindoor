import { prisma } from "../../config/db";
import type { Prisma, ProductType } from "../../generated/prisma/client";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { PriceHistory } from "../../utils/priceHistory";
import { RecipeHistory } from "../../utils/recipeVersions";
import { parseDateOnly, shiftDateKey, toDateKey, vnDateKeyOf, vnDayStartMs, vnHourCellMs } from "../../utils/vnTime";
import type { z } from "zod";
import type { costCheckCreateSchema } from "./costChecks.schemas";

type CostCheckCreateInput = z.infer<typeof costCheckCreateSchema>;

/** Một ô doanh số POS đã được xác định là thuộc kỳ của phiếu. */
export interface PosCell {
  soldOn: Date;
  hour: number;
  finishedGoodItemId: string;
  quantity: number;
}

/**
 * Mức phủ dữ liệu POS của kỳ — đóng dấu vào `reportSnapshot` để cảnh báo còn lại vĩnh viễn trên phiếu
 * chứ không nhảy một lần lúc tạo rồi mất.
 */
export interface PosCoverage {
  /** Số ngày lịch VN của kỳ, tính cả hai đầu. */
  expectedDays: number;
  daysWithData: number;
  /** Ngày không có ô doanh số nào — có thể là quán nghỉ, có thể là chưa ai nhập. Chỉ người dùng biết. */
  missingDays: string[];
  /** Tên món `THANH_PHAM` bị bỏ khỏi phép tính (đồ pha sẵn không có doanh thu, đã đếm ở phiếu kiểm kê). */
  skippedPreparedItems: string[];
}

export interface PosPeriodSales {
  cells: PosCell[];
  /** Tổng SL đã bán theo món, dùng ghi `CostCheckSoldItem` (bảng hiển thị). */
  byItem: Map<string, number>;
  coverage: PosCoverage;
}

/**
 * Doanh số POS thuộc kỳ `[opening.checkedAt, closing.checkedAt)` của một quán.
 *
 * **Chỗ DUY NHẤT cắt kỳ.** `createCostCheck`, `computeCostCheckReport` và route xem trước đều đi qua
 * đây — hai bản cắt kỳ lệch nhau sẽ làm phiếu hiện một số mà báo cáo chốt một số khác.
 *
 * Biên **trái đóng, phải mở**: phiếu kiểm cuối kỳ N chính là phiếu kiểm đầu kỳ N+1, đóng cả hai đầu
 * thì một ô giờ trùng khít `checkedAt` bị tính vào CẢ HAI phiếu.
 *
 * **Sai số đã biết, đừng tưởng là chính xác tới phút:** doanh số gom theo giờ nên mốc kỳ bị làm tròn
 * về ô giờ theo quy ước giữa-ô (`vnHourCellMs` → h:30), tối đa lệch một ô giờ mỗi đầu kỳ. Kiểm đầu kỳ
 * 08:20 thì ô giờ 8 (mốc 08:30) vào kỳ, kéo theo cả phần bán 08:00–08:20 trước lúc đếm tồn. Thực tế
 * quán đếm kho trước giờ mở hoặc sau giờ đóng nên ô biên thường rỗng.
 */
export async function loadPosSalesForPeriod(
  userId: string,
  opening: { checkedAt: Date },
  closing: { checkedAt: Date },
): Promise<PosPeriodSales> {
  const fromMs = opening.checkedAt.getTime();
  const toMs = closing.checkedAt.getTime();
  const fromDayKey = vnDateKeyOf(opening.checkedAt);
  const toDayKey = vnDateKeyOf(closing.checkedAt);

  // Lấy RỘNG ±1 ngày lịch rồi lọc lại trong JS (cùng mẫu với GET /pos-sales/by-shift): một ngày lịch
  // VN trải trên hai ngày UTC, truy vấn đúng biên sẽ thiếu ô đầu/cuối mà KHÔNG báo gì.
  const rows = await prisma.posSaleHour.findMany({
    where: {
      userId,
      soldOn: { gte: parseDateOnly(shiftDateKey(fromDayKey, -1)), lte: parseDateOnly(shiftDateKey(toDayKey, 1)) },
    },
    select: {
      soldOn: true,
      hour: true,
      quantity: true,
      finishedGoodItemId: true,
      finishedGoodItem: { select: { name: true, category: true } },
    },
  });

  const cells: PosCell[] = [];
  const skipped = new Set<string>();
  for (const row of rows) {
    const at = vnHourCellMs(row.soldOn, row.hour);
    if (at < fromMs || at >= toMs) continue;

    // Đồ pha sẵn không bao giờ là "món đã bán": nó được đếm ở phiếu kiểm kê quán và đã nằm trong tồn
    // đầu/cuối kỳ, nên tính thêm vào đây là tính hai lần — cộng doanh thu ảo. Đường nhập Excel từng
    // thiếu chốt chặn này nên dữ liệu thật đã có ô như vậy; lọc ở đây để phiếu không bị sai.
    if (row.finishedGoodItem.category === "THANH_PHAM") {
      skipped.add(row.finishedGoodItem.name);
      continue;
    }
    cells.push({
      soldOn: row.soldOn,
      hour: row.hour,
      finishedGoodItemId: row.finishedGoodItemId,
      quantity: Number(row.quantity),
    });
  }

  const byItem = new Map<string, number>();
  const daysWithData = new Set<string>();
  for (const cell of cells) {
    byItem.set(cell.finishedGoodItemId, (byItem.get(cell.finishedGoodItemId) ?? 0) + cell.quantity);
    daysWithData.add(toDateKey(cell.soldOn));
  }

  const expectedDayKeys: string[] = [];
  for (let key = fromDayKey; key <= toDayKey; key = shiftDateKey(key, 1)) expectedDayKeys.push(key);

  return {
    cells,
    byItem,
    coverage: {
      expectedDays: expectedDayKeys.length,
      daysWithData: daysWithData.size,
      missingDays: expectedDayKeys.filter((key) => !daysWithData.has(key)),
      skippedPreparedItems: [...skipped].sort((a, b) => a.localeCompare(b)),
    },
  };
}

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

  // Đọc POS MỘT LẦN rồi dùng cho cả bảng CostCheckSoldItem lẫn báo cáo. Nếu mỗi bên tự đọc, một lượt
  // nhập doanh số chen vào giữa sẽ làm bảng chốt lệch với báo cáo chốt — và cả hai đều vĩnh viễn.
  const sales = await loadPosSalesForPeriod(data.userId, opening, closing);
  if (sales.cells.length === 0) {
    const shop = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
    throw new HttpError(
      409,
      `Quán ${shop?.name ?? ""} chưa có dữ liệu doanh số POS nào trong kỳ ${formatVnDateTime(opening.checkedAt)} – ${formatVnDateTime(closing.checkedAt)}. ` +
        `Vào Quản trị › Doanh số POS để nhập (file POS hoặc gõ tay theo ca), rồi tạo lại phiếu. ` +
        `Nếu đã nhập mà vẫn báo thiếu: kiểm tra Quản trị › Ánh xạ món POS — còn một tên chưa ánh xạ thì cả file không ghi dòng nào.`,
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
        discountTra: data.discountTra,
        discountDav: data.discountDav,
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

  // Chốt cứng báo cáo ngay lúc tạo phiếu — phải chạy sau khi transaction ở trên đã
  // commit (computeCostCheckReport đọc lại qua prisma thường, không thấy được dữ
  // liệu chưa commit trong tx). Sửa giá vốn/giá bán/công thức sau này sẽ không làm
  // đổi số liệu của phiếu đã tạo.
  const { rows, summary } = await computeCostCheckReport(created.id, sales);
  const { reportSnapshot: _reportSnapshot, ...withSnapshot } = await prisma.costCheck.update({
    where: { id: created.id },
    data: { reportSnapshot: { rows, summary, posCoverage: sales.coverage } as unknown as Prisma.InputJsonValue },
    include: costCheckDetailInclude,
  });

  return { ...withSnapshot, report: rows, financialSummary: summary, posCoverage: sales.coverage };
}

/** "dd/MM/yyyy HH:mm" theo giờ VN — chỉ dùng cho thông báo lỗi gửi người dùng. */
function formatVnDateTime(instant: Date): string {
  const shifted = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** Thứ tự hiển thị Loại hàng hoá, khớp enum ProductType trong schema và productTypeLabel bên web. */
export const PRODUCT_TYPE_ORDER: ProductType[] = ["NVL", "COC_TAKE", "BANH", "DUNG_CU", "KHAC"];

/** Loại lạ (dữ liệu cũ, hàng hoá đã xoá) xếp xuống cuối thay vì lên đầu. */
export function productTypeRank(type: ProductType | null | undefined): number {
  const index = PRODUCT_TYPE_ORDER.indexOf(type as ProductType);
  return index === -1 ? PRODUCT_TYPE_ORDER.length : index;
}

/**
 * Loại → nhóm hàng hoá → tên. Dùng chung cho lúc tính mới và lúc bổ sung loại cho snapshot cũ.
 * Đọc phòng thủ: snapshot cũ là JSON không kiểu, có phiếu chốt từ trước khi MaterialRow có
 * productGroupName nên trường này có thể thiếu.
 */
export function compareMaterialRows(
  a: Partial<Pick<MaterialRow, "productType" | "productGroupName" | "name">>,
  b: Partial<Pick<MaterialRow, "productType" | "productGroupName" | "name">>,
): number {
  return (
    productTypeRank(a.productType) - productTypeRank(b.productType) ||
    (a.productGroupName ?? "").localeCompare(b.productGroupName ?? "") ||
    (a.name ?? "").localeCompare(b.name ?? "")
  );
}

export interface MaterialRow {
  productId: string;
  code: string;
  name: string;
  productType: ProductType;
  productGroupName: string;
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
 *
 * Công thức và giá bán được tra theo PHIÊN BẢN CÓ HIỆU LỰC tại từng mốc, không phải bản hiện hành:
 * quán đổi công thức giữa kỳ thì phần trước và phần sau mốc đổi phải tính bằng hai định mức khác nhau.
 * Mỗi con số có mốc riêng — tồn đầu kỳ theo `opening.checkedAt`, tồn cuối kỳ theo `closing.checkedAt`,
 * hàng huỷ theo `wasteAt` của từng phiếu, định mức theo NGÀY BÁN của từng ô giờ POS.
 *
 * `sales` truyền vào từ `createCostCheck` để bảng `CostCheckSoldItem` và báo cáo cùng đọc một lượt POS;
 * không truyền thì tự nạp (đường tính lại phiếu cũ chưa có snapshot).
 */
export async function computeCostCheckReport(
  costCheckId: string,
  sales?: PosPeriodSales,
): Promise<{ rows: MaterialRow[]; summary: FinancialSummary }> {
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

  // Lọc theo mốc nhận của TỪNG DÒNG (SalesOrderItem.receivedAt) chứ không phải mốc hoàn thành
  // của cả đơn — đơn nhận rải rác nhiều ngày sẽ rơi vào đúng kỳ của từng dòng, thay vì bị dồn
  // hết vào ngày bấm "Hoàn thành" lần cuối.
  const receivedGroups = await prisma.salesOrderItem.groupBy({
    by: ["productId"],
    where: {
      receivedAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      salesOrder: { createdById: costCheck.userId },
    },
    _sum: { receivedQuantity: true },
  });

  // Chỉ dòng huỷ được tích "trừ trong Check Cost"; dòng bỏ tích coi như hàng đã dùng (vẫn nằm trong actualUsed).
  const wasteItems = await prisma.materialWasteItem.findMany({
    where: {
      deductInCostCheck: true,
      materialWaste: {
        createdById: costCheck.userId,
        wasteAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
  });

  const wasteFinishedItems = await prisma.materialWasteFinishedItem.findMany({
    where: {
      deductInCostCheck: true,
      materialWaste: {
        createdById: costCheck.userId,
        wasteAt: { gte: opening.checkedAt, lte: closing.checkedAt },
      },
    },
    // Phải LẤY RA wasteAt, không chỉ lọc theo nó: đồ pha sẵn bị huỷ được quy về nguyên liệu bằng công
    // thức CÓ HIỆU LỰC LÚC HUỶ, nên cần mốc của từng phiếu.
    include: { materialWaste: { select: { wasteAt: true } } },
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

  const posSales = sales ?? (await loadPosSalesForPeriod(costCheck.userId, opening, closing));

  const finishedGoodItemIds = new Set<string>([
    ...opening.finishedItems.map((it) => it.finishedGoodItemId),
    ...closing.finishedItems.map((it) => it.finishedGoodItemId),
    ...wasteFinishedItems.map((it) => it.finishedGoodItemId),
    ...posSales.byItem.keys(),
  ]);

  const recipes = await RecipeHistory.load(finishedGoodItemIds);
  const openingAtMs = opening.checkedAt.getTime();
  const closingAtMs = closing.checkedAt.getTime();

  const productIds = new Set<string>([
    ...opening.items.map((it) => it.productId),
    ...closing.items.map((it) => it.productId),
    ...receivedGroups.map((r) => r.productId),
    ...wasteItems.map((it) => it.productId),
    ...transferInItems.map((it) => it.productId),
    ...transferOutItems.map((it) => it.productId),
    // Mọi nguyên liệu của những phiên bản công thức có hiệu lực ở đâu đó TRONG KỲ — không phải chỉ
    // phiên bản cuối kỳ (sẽ mất dòng nguyên liệu bị bỏ giữa kỳ dù đã dùng thật), cũng không phải mọi
    // phiên bản từng tồn tại (sẽ sống lại nguyên liệu bỏ từ năm ngoái).
    ...recipes.productIdsInWindow(openingAtMs, closingAtMs),
  ]);

  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    include: { unit: true, recipeUnit: true, productGroup: true },
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

    // Tồn đầu/cuối kỳ quy về nguyên liệu bằng công thức CÓ HIỆU LỰC ĐÚNG LÚC ĐẾM, không phải công
    // thức hiện hành: đồ pha sẵn đếm ngày 1 mà quy đổi bằng định lượng ngày 15 là sai cả cột Tồn đầu kỳ.
    const openingFg = opening.finishedItems.reduce(
      (sum, it) => sum + Number(it.quantity) * recipes.quantityAt(it.finishedGoodItemId, productId, openingAtMs),
      0,
    );
    const closingFg = closing.finishedItems.reduce(
      (sum, it) => sum + Number(it.quantity) * recipes.quantityAt(it.finishedGoodItemId, productId, closingAtMs),
      0,
    );

    const receivedRaw = (receivedByProduct.get(productId) ?? 0) * factor;
    const wastedRaw = (wasteByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );
    const wastedFg = wasteFinishedItems.reduce(
      (sum, it) =>
        sum +
        Number(it.quantity) *
          recipes.quantityAt(it.finishedGoodItemId, productId, it.materialWaste.wasteAt.getTime()),
      0,
    );
    const wasted = wastedRaw + wastedFg;

    const transferInRaw = (transferInByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );
    const transferOutRaw = (transferOutByProduct.get(productId) ?? []).reduce(
      (sum, it) => sum + toRecipeUnit(factor, it.wholeQuantity, it.looseQuantity),
      0,
    );

    // Định mức tính theo TỪNG Ô GIỜ POS với công thức có hiệu lực đúng ngày bán đó — nhờ vậy đổi
    // công thức giữa kỳ không cần tách phiếu: phần bán trước mốc đổi dùng định lượng cũ, phần sau
    // dùng định lượng mới, trong cùng một phiếu.
    const theoretical = posSales.cells.reduce(
      (sum, cell) =>
        sum +
        cell.quantity *
          recipes.quantityOnDay(cell.finishedGoodItemId, productId, toDateKey(cell.soldOn), vnDayStartMs(cell.soldOn)),
      0,
    );

    const received = receivedRaw + transferInRaw;
    const openingQty = openingRaw + openingFg;
    const closingQty = closingRaw + closingFg;
    const actualUsed = openingQty + received - wasted - transferOutRaw - closingQty;

    rows.push({
      productId,
      code: product.code,
      name: product.name,
      productType: product.type,
      productGroupName: product.productGroup.name,
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

  rows.sort(compareMaterialRows);

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

  // Doanh thu tính trên TỪNG Ô GIỜ POS × giá bán có hiệu lực ngày đó, không phải trên
  // `costCheck.soldItems` × giá hiện hành: đổi giá bán giữa kỳ thì phần trước và phần sau mốc đổi phải
  // tính bằng hai giá khác nhau. `CostCheckSoldItem` từ đây chỉ còn là bảng HIỂN THỊ (tổng theo món),
  // không còn là đầu vào — sửa tay bảng đó không làm đổi báo cáo.
  const prices = await PriceHistory.load(posSales.byItem.keys());
  let revenueTra = 0;
  let revenueDav = 0;
  for (const cell of posSales.cells) {
    const category = prices.category(cell.finishedGoodItemId);
    if (category !== "TRA" && category !== "DAV") continue; // món chưa khai loại thì không vào doanh thu nào
    const value = cell.quantity * prices.priceOnDay(cell.finishedGoodItemId, toDateKey(cell.soldOn), vnDayStartMs(cell.soldOn));
    if (category === "TRA") revenueTra += value;
    else revenueDav += value;
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
