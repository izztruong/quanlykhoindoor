import { z } from "zod";
import { prisma } from "../../../config/db";
import { HttpError } from "../../../utils/httpError";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, num, shopIdParam } from "../shared";

// Thành tiền phiếu kiểm KHÔNG lưu — tính lúc xem: SL × đơn giá đã chốt trên phiếu (wholePrice theo đơn
// vị chính, loosePrice theo đơn vị công thức), thiếu vế nào thì coi như 0. Đúng như lineAmount ở
// StockCheckDetailClient bên web — đổi một bên thì phải đổi bên kia.
function lineAmount(quantity: number | null, price: number | null): number {
  return (quantity ?? 0) * (price ?? 0);
}

const STOCK_CHECK_TYPES = ["WEEKLY", "MONTHLY"] as const;

const LATENESS_DOC =
  "isLate/dueAt chốt lúc nộp (dueAt null = chưa đánh giá, không tính muộn hay đúng hạn). " +
  "checkedAt = thời điểm kiểm quán tự khai (quyết định kỳ), submittedAt = lúc lưu vào hệ thống.";

function header(c: {
  code: string;
  type: string | null;
  checkedAt: Date;
  createdAt: Date;
  dueAt: Date | null;
  isLate: boolean;
  note: string | null;
  createdBy: { name: string } | null;
}) {
  return {
    code: c.code,
    shop: c.createdBy?.name ?? null,
    type: c.type,
    checkedAt: formatVnDateTime(c.checkedAt),
    submittedAt: formatVnDateTime(c.createdAt),
    dueAt: formatVnDateTime(c.dueAt),
    isLate: c.dueAt ? c.isLate : null,
    note: c.note,
  };
}

export const listStockChecks = defineTool({
  name: "list_stock_checks",
  title: "Phiếu kiểm kê quán — danh sách",
  description:
    "Phiếu kiểm kê quán (mã KT…) theo NGÀY KIỂM trong khoảng ngày (giờ VN). Quán = người lập phiếu. " +
    "type: WEEKLY = kiểm tuần, MONTHLY = kiểm tháng, null = phiếu cũ không phân loại. " +
    `${LATENESS_DOC} Mỗi phiếu kèm số dòng và giá trị tồn: materialTotal (nguyên liệu), finishedTotal ` +
    "(đồ thành phẩm), total — tính bằng SL × đơn giá đã chốt trên phiếu. Số lượng từng mặt hàng: gọi get_stock_check.",
  input: {
    ...dateRangeInput,
    shopId: shopIdParam,
    type: z.enum(STOCK_CHECK_TYPES).optional().describe("Lọc loại phiếu. Bỏ trống = mọi loại."),
  },
  run: async ({ from, to, shopId, type }) => {
    const checks = await prisma.stockCheck.findMany({
      where: { checkedAt: dateTimeRange(from, to), createdById: shopId, type },
      orderBy: { checkedAt: "asc" },
      include: {
        createdBy: { select: { name: true } },
        items: { select: { wholeQuantity: true, wholePrice: true, looseQuantity: true, loosePrice: true } },
        finishedItems: { select: { quantity: true, price: true } },
      },
    });
    return capRows(
      checks.map((c) => {
        const materialTotal = Math.round(
          c.items.reduce(
            (sum, it) => sum + lineAmount(num(it.wholeQuantity), num(it.wholePrice)) + lineAmount(num(it.looseQuantity), num(it.loosePrice)),
            0,
          ),
        );
        const finishedTotal = Math.round(c.finishedItems.reduce((sum, it) => sum + lineAmount(num(it.quantity), num(it.price)), 0));
        return {
          ...header(c),
          materialLines: c.items.length,
          finishedLines: c.finishedItems.length,
          materialTotal,
          finishedTotal,
          total: materialTotal + finishedTotal,
        };
      }),
    );
  },
});

export const getStockCheck = defineTool({
  name: "get_stock_check",
  title: "Phiếu kiểm kê quán — chi tiết một phiếu",
  description:
    "Chi tiết một phiếu kiểm kê quán theo mã (KT…) hoặc id. " +
    "items = nguyên liệu: wholeQuantity theo đơn vị chính (unit) × wholePrice; looseQuantity là SL lẻ theo đơn vị " +
    "công thức (looseUnit, vd gam) đã TRỪ VỎ × loosePrice; amount = tổng hai vế. " +
    "finishedItems = đồ thành phẩm pha sẵn đếm được: quantity × price. Đơn giá là giá chốt trên phiếu lúc kiểm. " +
    LATENESS_DOC,
  input: { codeOrId: z.string().min(1).describe("Mã phiếu (vd KT2609…) hoặc id") },
  run: async ({ codeOrId }) => {
    const c = await prisma.stockCheck.findFirst({
      where: { OR: [{ code: codeOrId }, { id: codeOrId }] },
      include: {
        createdBy: { select: { name: true } },
        items: {
          include: {
            product: {
              select: {
                code: true,
                name: true,
                unit: { select: { name: true } },
                recipeUnit: { select: { name: true } },
                productGroup: { select: { name: true } },
              },
            },
          },
          orderBy: { product: { name: "asc" } },
        },
        finishedItems: {
          include: { finishedGoodItem: { select: { code: true, name: true, unit: { select: { name: true } } } } },
          orderBy: { finishedGoodItem: { name: "asc" } },
        },
      },
    });
    if (!c) throw new HttpError(404, `Không tìm thấy phiếu kiểm kê "${codeOrId}"`);

    const items = c.items.map((it) => {
      const wholeQuantity = num(it.wholeQuantity);
      const wholePrice = num(it.wholePrice);
      const looseQuantity = num(it.looseQuantity);
      const loosePrice = num(it.loosePrice);
      return {
        productCode: it.product.code,
        name: it.product.name,
        group: it.product.productGroup.name,
        unit: it.product.unit.name,
        wholeQuantity,
        wholePrice,
        looseUnit: it.product.recipeUnit?.name ?? it.product.unit.name,
        looseQuantity,
        loosePrice,
        amount: Math.round(lineAmount(wholeQuantity, wholePrice) + lineAmount(looseQuantity, loosePrice)),
        note: it.note,
      };
    });
    const finishedItems = c.finishedItems.map((it) => {
      const quantity = num(it.quantity);
      const price = num(it.price);
      return {
        code: it.finishedGoodItem.code,
        name: it.finishedGoodItem.name,
        unit: it.finishedGoodItem.unit.name,
        quantity,
        price,
        amount: Math.round(lineAmount(quantity, price)),
        note: it.note,
      };
    });
    // Cộng trên số chưa làm tròn rồi mới làm tròn — cùng cách list_stock_checks, để tổng hai tool khớp nhau.
    const materialTotal = Math.round(
      c.items.reduce(
        (sum, it) => sum + lineAmount(num(it.wholeQuantity), num(it.wholePrice)) + lineAmount(num(it.looseQuantity), num(it.loosePrice)),
        0,
      ),
    );
    const finishedTotal = Math.round(c.finishedItems.reduce((sum, it) => sum + lineAmount(num(it.quantity), num(it.price)), 0));
    return { ...header(c), materialTotal, finishedTotal, total: materialTotal + finishedTotal, items, finishedItems };
  },
});
