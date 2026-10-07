import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";

/**
 * Chặn sửa `Product.recipeUnitsPerBaseUnit` khi hàng hoá đã có phát sinh.
 *
 * Hệ số quy đổi không phải một thuộc tính danh mục bình thường: mọi SL đã lưu trong phiếu đều được
 * đọc lại qua nó (`toRecipeUnit(factor, wholeQuantity, looseQuantity)`), và `tareWeight` cũng tính
 * theo `recipeUnit`. Đổi 1 Hộp = 1000 Gram thành 1 Hộp = 1 Gram là tồn đầu/cuối kỳ của MỌI phiếu cũ
 * bị chia 1000 — không có cảnh báo nào, chỉ là số liệu sai.
 *
 * Không version hoá trường này (xem `docs/progress.md`): lịch sử hoá hệ số quy đổi rất rối mà vẫn
 * không chữa được các con số đã lưu. Chặn là stopgap, và nhận là stopgap.
 *
 * **Không có đường thoát**: gõ sai hệ số rồi lập một phiếu là khoá chết. Lối ra duy nhất là tạo mã
 * hàng hoá mới với hệ số đúng và đặt `active = false` cho mã cũ.
 *
 * Mount TRƯỚC `productsRouter`: tiếp quản hẳn `PUT /:id` và `POST /bulk-import`, các route còn lại
 * rơi xuống `crudFactory`.
 */
export const productRecipeUnitGuardRouter = Router();

/** Bảng nào có dòng là coi như hàng hoá đã phát sinh. Tên dùng cho thông báo lỗi. */
const USAGE_TABLES = [
  { label: "phiếu kiểm kê quán", find: (productId: string) => prisma.stockCheckItem.findFirst({ where: { productId }, select: { stockCheck: { select: { code: true } } } }) },
  { label: "đơn hàng", find: (productId: string) => prisma.salesOrderItem.findFirst({ where: { productId }, select: { salesOrder: { select: { code: true } } } }) },
  { label: "phiếu huỷ nguyên liệu", find: (productId: string) => prisma.materialWasteItem.findFirst({ where: { productId }, select: { materialWaste: { select: { code: true } } } }) },
  { label: "phiếu điều chuyển", find: (productId: string) => prisma.materialTransferItem.findFirst({ where: { productId }, select: { materialTransfer: { select: { code: true } } } }) },
  { label: "phiếu nhập kho", find: (productId: string) => prisma.stockImportItem.findFirst({ where: { productId }, select: { stockImport: { select: { code: true } } } }) },
  { label: "phiếu xuất kho", find: (productId: string) => prisma.stockExportItem.findFirst({ where: { productId }, select: { stockExport: { select: { code: true } } } }) },
  { label: "phiếu kiểm kê kho", find: (productId: string) => prisma.inventoryCountItem.findFirst({ where: { productId }, select: { inventoryCount: { select: { code: true } } } }) },
] as const;

/** `undefined` = payload không nhắc tới trường này, không phải thay đổi. So ở mức 4 chữ số thập phân. */
function sameFactor(current: unknown, next: number | undefined): boolean {
  if (next === undefined) return true;
  if (current == null) return false;
  return Number(current).toFixed(4) === Number(next).toFixed(4);
}

/** Tên phiếu đầu tiên vướng, để thông báo nói rõ chỗ nào đang chặn chứ không nói chung chung. */
async function firstUsage(productId: string): Promise<string | null> {
  for (const table of USAGE_TABLES) {
    const row = (await table.find(productId)) as Record<string, { code: string } | null> | null;
    if (!row) continue;
    const code = Object.values(row).find((v) => v && typeof v === "object" && "code" in v)?.code;
    return code ? `${table.label} ${code}` : table.label;
  }
  return null;
}

async function assertFactorChangeAllowed(product: { id: string; code: string; name: string; recipeUnitsPerBaseUnit: unknown }, next: number | undefined) {
  if (sameFactor(product.recipeUnitsPerBaseUnit, next)) return;
  const usage = await firstUsage(product.id);
  if (!usage) return;
  throw new HttpError(
    400,
    `Không đổi được hệ số quy đổi của "${product.name}" (${product.code}): hàng hoá đã có phát sinh ở ${usage}. ` +
      `Đổi hệ số sẽ làm sai số lượng của mọi phiếu cũ. Nếu thật sự cần hệ số khác thì tạo mã hàng hoá mới và ngừng dùng mã này.`,
  );
}

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  productGroupId: z.string().min(1),
  costPrice: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
  recipeUnitId: z.string().optional(),
  recipeUnitsPerBaseUnit: z.coerce.number().positive().optional(),
  type: z.enum(["NVL", "COC_TAKE", "BANH", "DUNG_CU", "KHAC"]).default("NVL"),
  tareWeight: z.coerce.number().nonnegative().optional(),
  active: z.boolean().optional().default(true),
});

productRecipeUnitGuardRouter.put("/:id", requirePermission("PRODUCTS"), async (req, res, next) => {
  const data = productSchema.partial().parse(req.body);
  const existing = await prisma.product.findUnique({
    where: { id: req.params.id },
    select: { id: true, code: true, name: true, recipeUnitsPerBaseUnit: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy bản ghi");

  await assertFactorChangeAllowed(existing, data.recipeUnitsPerBaseUnit);
  next(); // cho crudFactory ghi như cũ — chốt này chỉ kiểm, không ghi gì
});

productRecipeUnitGuardRouter.post(
  "/bulk-import",
  requirePermission("PRODUCTS", "ADD"),
  requirePermission("PRODUCTS", "EDIT"),
  async (req, res, next) => {
    const { items } = z.object({ items: z.array(productSchema).min(1) }).parse(req.body);

    // bulk-import update theo `code` với TRỌN DÒNG, nên mỗi lần nhập Excel là "set" lại hệ số cho cả
    // mấy trăm hàng hoá. Chặn kiểu "payload có mặt trường này → 400" sẽ làm chết đường nhập đang
    // chạy; phải so giá trị mới với giá trị đang lưu và chỉ chặn khi đổi THẬT.
    const existing = await prisma.product.findMany({
      where: { code: { in: items.map((it) => it.code) } },
      select: { id: true, code: true, name: true, recipeUnitsPerBaseUnit: true },
    });
    const byCode = new Map(existing.map((row) => [row.code, row]));

    for (const item of items) {
      const current = byCode.get(item.code);
      if (!current) continue; // hàng hoá mới — chưa có phát sinh nào
      await assertFactorChangeAllowed(current, item.recipeUnitsPerBaseUnit);
    }
    next();
  },
);
