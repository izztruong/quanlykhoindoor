import { prisma } from "../../config/db";
import { assertInScope, type AuthUser } from "../../middleware/auth";
import {
  stockImportItemsWhere,
  transferInItemsWhere,
  transferOutItemsWhere,
  wasteFinishedItemsWhere,
  wasteItemsWhere,
  type CostCheckPeriod,
} from "../../utils/costCheckSources";
import { HttpError } from "../../utils/httpError";
import { RecipeHistory } from "../../utils/recipeVersions";

/**
 * Phiếu gốc làm nên các cột Nhận / Xuất / Đã huỷ của MỘT nguyên liệu trên một phiếu Check Cost.
 *
 * Đọc DỮ LIỆU SỐNG, còn số trên phiếu là `reportSnapshot` chốt lúc tạo. Phiếu nguồn bị sửa/xoá/thêm
 * sau đó thì hai bên lệch — trả kèm `snapshot` để giao diện so và báo, KHÔNG cố "khớp" cho bằng nhau:
 * chỗ lệch chính là tín hiệu phiếu Check Cost đã cũ.
 *
 * Bộ lọc kỳ đi qua `utils/costCheckSources` — cùng các hàm `computeCostCheckReport` dùng. Quy đổi đơn
 * vị chép đúng luật của hàm đó: phiếu nhập `quantity × factor`, điều chuyển/huỷ
 * `wholeQuantity × factor + looseQuantity`, món đã pha bị huỷ quy về nguyên liệu bằng công thức có
 * hiệu lực LÚC HUỶ (bản riêng của quán nếu có — phải truyền quán vào `RecipeHistory.load`).
 */
export async function getCostCheckSources(costCheckId: string, productId: string, user: AuthUser | undefined) {
  const costCheck = await prisma.costCheck.findUnique({
    where: { id: costCheckId },
    select: {
      id: true,
      code: true,
      userId: true,
      createdAt: true,
      reportSnapshot: true,
      user: { select: { name: true, role: { select: { isBakery: true } } } },
      openingStockCheck: { select: { checkedAt: true } },
      closingStockCheck: { select: { checkedAt: true } },
    },
  });
  if (!costCheck) throw new HttpError(404, "Không tìm thấy phiếu Check Cost");

  // Route đã chặn chỉ quản trị viên (phạm vi ALL) — giữ chốt phạm vi để nới cổng route về sau không
  // thành lỗ xem phiếu quán khác.
  const isBakery = costCheck.user.role.isBakery;
  assertInScope([costCheck.userId], user, "Không tìm thấy phiếu Check Cost");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      code: true,
      name: true,
      recipeUnitsPerBaseUnit: true,
      unit: { select: { name: true } },
      recipeUnit: { select: { name: true } },
    },
  });
  if (!product) throw new HttpError(404, "Không tìm thấy nguyên liệu");
  const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
  const toRecipeUnit = (whole: unknown, loose: unknown) => Number(whole ?? 0) * factor + Number(loose ?? 0);
  const numOrNull = (v: unknown) => (v == null ? null : Number(v));

  const period: CostCheckPeriod = {
    shopUserId: costCheck.userId,
    from: costCheck.openingStockCheck.checkedAt,
    to: costCheck.closingStockCheck.checkedAt,
  };

  const [importItems, transferInItems, transferOutItems, wasteItems, wasteFinishedItems] = await Promise.all([
    prisma.stockImportItem.findMany({
      where: { ...stockImportItemsWhere(period), productId },
      select: {
        quantity: true,
        stockImport: {
          select: { id: true, code: true, transactionAt: true, supplier: { select: { name: true } } },
        },
      },
      orderBy: { stockImport: { transactionAt: "asc" } },
    }),
    prisma.materialTransferItem.findMany({
      where: { ...transferInItemsWhere(period), productId },
      select: {
        wholeQuantity: true,
        looseQuantity: true,
        materialTransfer: { select: { id: true, code: true, transferAt: true, fromUser: { select: { name: true } } } },
      },
      orderBy: { materialTransfer: { transferAt: "asc" } },
    }),
    prisma.materialTransferItem.findMany({
      where: { ...transferOutItemsWhere(period), productId },
      select: {
        wholeQuantity: true,
        looseQuantity: true,
        materialTransfer: { select: { id: true, code: true, transferAt: true, toUser: { select: { name: true } } } },
      },
      orderBy: { materialTransfer: { transferAt: "asc" } },
    }),
    prisma.materialWasteItem.findMany({
      where: { ...wasteItemsWhere(period), productId },
      select: {
        wholeQuantity: true,
        looseQuantity: true,
        materialWaste: { select: { id: true, code: true, wasteAt: true } },
      },
      orderBy: { materialWaste: { wasteAt: "asc" } },
    }),
    // Không lọc được theo nguyên liệu ở DB — nguyên liệu nằm trong công thức, mà công thức đổi theo
    // thời gian. Lấy mọi món bị huỷ trong kỳ rồi giữ dòng nào quy ra nguyên liệu này khác 0.
    prisma.materialWasteFinishedItem.findMany({
      where: wasteFinishedItemsWhere(period),
      select: {
        finishedGoodItemId: true,
        quantity: true,
        finishedGoodItem: { select: { name: true } },
        materialWaste: { select: { id: true, code: true, wasteAt: true } },
      },
      orderBy: { materialWaste: { wasteAt: "asc" } },
    }),
  ]);

  const recipes = await RecipeHistory.load(
    new Set(wasteFinishedItems.map((it) => it.finishedGoodItemId)),
    costCheck.userId,
  );

  const imports = importItems.map((it) => ({
    id: it.stockImport.id,
    code: it.stockImport.code,
    at: it.stockImport.transactionAt,
    supplierName: it.stockImport.supplier?.name ?? null,
    quantity: Number(it.quantity),
    qtyInRecipeUnit: Number(it.quantity) * factor,
  }));
  const transfersIn = transferInItems.map((it) => ({
    id: it.materialTransfer.id,
    code: it.materialTransfer.code,
    at: it.materialTransfer.transferAt,
    shopName: it.materialTransfer.fromUser.name,
    wholeQuantity: numOrNull(it.wholeQuantity),
    looseQuantity: numOrNull(it.looseQuantity),
    qtyInRecipeUnit: toRecipeUnit(it.wholeQuantity, it.looseQuantity),
  }));
  const transfersOut = transferOutItems.map((it) => ({
    id: it.materialTransfer.id,
    code: it.materialTransfer.code,
    at: it.materialTransfer.transferAt,
    shopName: it.materialTransfer.toUser.name,
    wholeQuantity: numOrNull(it.wholeQuantity),
    looseQuantity: numOrNull(it.looseQuantity),
    qtyInRecipeUnit: toRecipeUnit(it.wholeQuantity, it.looseQuantity),
  }));
  const wasteRaw = wasteItems.map((it) => ({
    id: it.materialWaste.id,
    code: it.materialWaste.code,
    at: it.materialWaste.wasteAt,
    wholeQuantity: numOrNull(it.wholeQuantity),
    looseQuantity: numOrNull(it.looseQuantity),
    qtyInRecipeUnit: toRecipeUnit(it.wholeQuantity, it.looseQuantity),
  }));
  const wasteFinished = wasteFinishedItems
    .map((it) => {
      const perUnit = recipes.quantityAt(it.finishedGoodItemId, productId, it.materialWaste.wasteAt.getTime());
      return {
        id: it.materialWaste.id,
        code: it.materialWaste.code,
        at: it.materialWaste.wasteAt,
        finishedGoodName: it.finishedGoodItem.name,
        quantity: Number(it.quantity),
        perUnit,
        qtyInRecipeUnit: Number(it.quantity) * perUnit,
      };
    })
    .filter((it) => it.qtyInRecipeUnit !== 0);

  const sum = (list: { qtyInRecipeUnit: number }[]) => list.reduce((s, it) => s + it.qtyInRecipeUnit, 0);

  // Dòng của nguyên liệu này trong số đã chốt. Nguyên liệu không có dòng nào thì null — giao diện khi
  // đó không so được, chỉ hiện danh sách.
  const snapshotRows = (costCheck.reportSnapshot as { rows?: unknown } | null)?.rows;
  const snapshotRow = Array.isArray(snapshotRows)
    ? (snapshotRows as { productId: string; receivedQty: number; transferOutQty: number; wastedQty: number }[]).find(
        (row) => row.productId === productId,
      )
    : undefined;

  return {
    costCheck: {
      id: costCheck.id,
      code: costCheck.code,
      shopName: costCheck.user.name,
      isBakery,
      from: period.from,
      to: period.to,
      createdAt: costCheck.createdAt,
    },
    product: {
      id: product.id,
      code: product.code,
      name: product.name,
      baseUnitName: product.unit.name,
      recipeUnitName: product.recipeUnit?.name ?? product.unit.name,
      factor,
    },
    snapshot: snapshotRow
      ? {
          receivedQty: snapshotRow.receivedQty,
          transferOutQty: snapshotRow.transferOutQty,
          wastedQty: snapshotRow.wastedQty,
        }
      : null,
    received: { imports, transfersIn, total: sum(imports) + sum(transfersIn) },
    transferOut: { items: transfersOut, total: sum(transfersOut) },
    wasted: { raw: wasteRaw, finished: wasteFinished, total: sum(wasteRaw) + sum(wasteFinished) },
  };
}
