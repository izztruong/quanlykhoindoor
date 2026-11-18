import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";

const schema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  unitId: z.string().min(1),
  // TRA/DAV dùng tách doanh thu/chi phí trong Check Cost; THANH_PHAM là vật tư/đồ pha
  // sẵn cần kiểm kê vật lý (không tính doanh thu). Giá bán dùng tính doanh thu.
  category: z.enum(["TRA", "DAV", "THANH_PHAM"]).optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
  // VAT tính theo PHẦN TRĂM (8 = 8%), không phải hệ số. Để trống = chưa khai = Check Cost coi như 0%.
  // Chỉ có tác dụng với phiếu Check Cost lập khi bật cờ "Dùng VAT".
  // `.nullish()` chứ không `.optional()`: giao diện gửi `null` để GỠ VAT đã khai về chưa khai.
  vatPercent: z.coerce.number().min(0).max(999.99).nullish(),
  // KHÔNG `.default(true)`: `schema.partial()` của Zod 4 vẫn điền default, nên PUT gửi thiếu trường sẽ
  // bật lại món đã ngừng bán (vết y hệt `PUT /products/:id`). Tạo mới thì DB tự để true.
  // PHẢI giữ khớp `finishedGoodItemSchema` bên `finishedGoodPrices` — PUT và bulk-import đi qua schema đó.
  active: z.boolean().optional(),
});

export const finishedGoodItemsRouter = createCrudRouter(prisma.finishedGoodItem, {
  createSchema: schema,
  updateSchema: schema.partial(),
  searchFields: ["code", "name"],
  include: { unit: true },
  resource: "FINISHED_GOODS",
  publicRead: true,
  bulkImportKey: "code",
});
