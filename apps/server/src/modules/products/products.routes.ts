import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  productGroupId: z.string().min(1),
  costPrice: z.coerce.number().nonnegative().default(0),
  note: z.string().optional(),
  // Quy đổi cho công thức Check Cost: 1 đơn vị chính = recipeUnitsPerBaseUnit recipeUnit (vd 1 Hộp = 1000 Gram).
  recipeUnitId: z.string().optional(),
  recipeUnitsPerBaseUnit: z.coerce.number().positive().optional(),
  // Dùng để gộp chi phí Check Cost — 5 giá trị cố định.
  type: z.enum(["NVL", "COC_TAKE", "BANH", "DUNG_CU", "KHAC"]).default("NVL"),
  // SL lẻ nhập lúc kiểm kê/huỷ/điều chuyển được coi là cân cả vỏ và tự trừ số này (theo recipeUnit).
  tareWeight: z.coerce.number().nonnegative().optional(),
  // Số ngày dùng được sau khi quán nhận hàng — chỉ dùng để KẸP số ngày cần phủ khi gợi ý đặt hàng,
  // không phải theo dõi hạn từng lô. Cho phép null để form gỡ được giá trị đã khai.
  shelfLifeDays: z.coerce.number().int().positive().nullable().optional(),
  // Số ngày từ lúc đặt tới lúc quán nhận được hàng — khác nhau theo hàng hoá (cà phê 4–5, bột 1–2).
  // Với hàng CENTRAL còn là ngưỡng kích hoạt: gọi khi tồn toàn chuỗi còn đủ dùng dưới leadDays ngày.
  leadDays: z.coerce.number().int().min(0).max(60).nullable().optional(),
  // Nhịp gọi. Để trống = tự suy từ công nợ của NCC ưu tiên, nên null là giá trị hợp lệ và có ý nghĩa.
  orderCadence: z.enum(["CREDIT_TWICE_MONTHLY", "BY_COVER_DAYS", "CENTRAL"]).nullable().optional(),
  // Số ngày cần phủ mặc định cho hàng hoá này (hoa quả để 1). Chỉ có nghĩa với BY_COVER_DAYS.
  coverDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
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
