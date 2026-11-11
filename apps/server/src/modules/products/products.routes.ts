import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  productGroupId: z.string().min(1),
  costPrice: z.coerce.number().nonnegative().default(0),
  // VAT tính theo PHẦN TRĂM (8 = 8%), không phải hệ số. Để trống = chưa khai = Check Cost coi như 0%.
  // Chỉ có tác dụng với phiếu Check Cost lập khi bật cờ "Dùng VAT".
  // `.nullish()` chứ không `.optional()`: giao diện gửi `null` để GỠ VAT đã khai về chưa khai.
  vatPercent: z.coerce.number().min(0).max(999.99).nullish(),
  note: z.string().optional(),
  // Quy đổi cho công thức Check Cost: 1 đơn vị chính = recipeUnitsPerBaseUnit recipeUnit (vd 1 Hộp = 1000 Gram).
  recipeUnitId: z.string().optional(),
  recipeUnitsPerBaseUnit: z.coerce.number().positive().optional(),
  // Dùng để gộp chi phí Check Cost — 5 giá trị cố định.
  type: z.enum(["NVL", "COC_TAKE", "BANH", "DUNG_CU", "KHAC"]).default("NVL"),
  // SL lẻ nhập lúc kiểm kê/huỷ/điều chuyển được coi là cân cả vỏ và tự trừ số này (theo recipeUnit).
  tareWeight: z.coerce.number().nonnegative().optional(),
  // Hàng hoá ngừng dùng (active=false) bị ẩn khỏi ô chọn hàng hoá khi tạo phiếu/đơn hàng mới.
  active: z.boolean().optional().default(true),
});

export const productsRouter = createCrudRouter(prisma.product, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true, productGroup: true, recipeUnit: true },
  resource: "PRODUCTS",
  publicRead: true,
  bulkImportKey: "code",
  filterFields: ["productGroupId", "type", "active"],
  booleanFilterFields: ["active"],
});
