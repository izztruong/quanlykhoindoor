import { prisma } from "../../../config/db";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, num, shopIdParam } from "../shared";

export const listMaterialTransfers = defineTool({
  name: "list_material_transfers",
  title: "Điều chuyển nguyên liệu",
  description:
    "Phiếu điều chuyển nguyên liệu giữa hai quán, theo ngày điều chuyển (giờ VN). shopId lọc phiếu mà quán đó là bên gửi HOẶC bên nhận. " +
    "Mỗi dòng: wholeQuantity theo đơn vị chính (unit), looseQuantity là SL lẻ theo đơn vị công thức (looseUnit, vd gam) đã trừ vỏ; " +
    "costPrice là giá vốn theo đơn vị chính, có thể trống.",
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const transfers = await prisma.materialTransfer.findMany({
      where: {
        transferAt: dateTimeRange(from, to),
        ...(shopId ? { OR: [{ fromUserId: shopId }, { toUserId: shopId }] } : {}),
      },
      orderBy: { transferAt: "asc" },
      include: {
        fromUser: { select: { name: true } },
        toUser: { select: { name: true } },
        items: {
          include: {
            product: { select: { code: true, name: true, unit: { select: { name: true } }, recipeUnit: { select: { name: true } } } },
            supplier: { select: { name: true } },
          },
        },
      },
    });
    return capRows(
      transfers.map((t) => ({
        code: t.code,
        transferAt: formatVnDateTime(t.transferAt),
        fromShop: t.fromUser.name,
        toShop: t.toUser.name,
        note: t.note,
        items: t.items.map((it) => ({
          productCode: it.product.code,
          name: it.product.name,
          unit: it.product.unit.name,
          wholeQuantity: num(it.wholeQuantity),
          looseUnit: it.product.recipeUnit?.name ?? it.product.unit.name,
          looseQuantity: num(it.looseQuantity),
          supplier: it.supplier?.name ?? null,
          costPrice: num(it.costPrice),
          note: it.note,
        })),
      })),
    );
  },
});
