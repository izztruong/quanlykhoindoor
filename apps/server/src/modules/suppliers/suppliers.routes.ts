import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";
import { HttpError } from "../../utils/httpError";

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  // Tài khoản tiệm bánh ứng với NCC này (đơn bánh). "" (ô select "Không có") và null đều là bỏ nối;
  // `undefined` giữ nguyên để PUT không âm thầm gỡ nối — cùng lý do như `shopUserId` của kho.
  bakeryUserId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
});

const bakeryUserInclude = { bakeryUser: { select: { id: true, name: true } } };

const OPEN_ORDER_STATUSES = ["ORDERED", "CONFIRMED", "IN_TRANSIT"] as const;

/**
 * Ba ràng buộc phải tra DB, không nằm trong zod được:
 *  1. Chỉ nối với tài khoản thuộc vai trò "Là tiệm bánh".
 *  2. Một tiệm bánh đúng một NCC — cột đã `@unique`, chặn ở đây để trả 409 tiếng Việt thay vì P2002.
 *  3. Không đổi nối khi NCC còn đơn bánh chưa xong: người xác nhận đơn suy từ nối này, đổi giữa chừng
 *     là đơn đang dở rơi sang tay một tiệm bánh khác.
 */
async function assertBakeryLink(bakeryUserId: string | null | undefined, supplierId?: string) {
  if (bakeryUserId === undefined) return;

  if (supplierId) {
    const current = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { bakeryUserId: true } });
    if (current && current.bakeryUserId !== bakeryUserId) {
      const open = await prisma.bakeryOrder.count({ where: { supplierId, status: { in: [...OPEN_ORDER_STATUSES] } } });
      if (open > 0) {
        throw new HttpError(409, `NCC này còn ${open} đơn bánh chưa hoàn thành — đợi xong hết rồi mới đổi tài khoản tiệm bánh`);
      }
    }
  }

  if (!bakeryUserId) return;
  const user = await prisma.user.findUnique({
    where: { id: bakeryUserId },
    select: { name: true, role: { select: { isBakery: true } } },
  });
  if (!user) throw new HttpError(400, "Không tìm thấy tài khoản tiệm bánh được chọn");
  if (!user.role.isBakery) throw new HttpError(400, `Tài khoản "${user.name}" không thuộc vai trò "Là tiệm bánh"`);

  const taken = await prisma.supplier.findUnique({ where: { bakeryUserId }, select: { id: true, name: true } });
  if (taken && taken.id !== supplierId) {
    throw new HttpError(409, `Tiệm bánh "${user.name}" đã nối với NCC "${taken.name}". Mỗi tiệm bánh chỉ một NCC.`);
  }
}

export const suppliersRouter = createCrudRouter(prisma.supplier, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name", "phone"],
  resource: "SUPPLIERS",
  publicRead: true,
  include: bakeryUserInclude,
  bulkImportKey: "code",
  beforeWrite: (data, { id }) => assertBakeryLink(data.bakeryUserId, id),
  // Đơn bánh nối NCC bằng khoá ngoại không cascade — để Prisma nổ thì người dùng nhận lỗi thô.
  beforeDelete: async (id) => {
    const orders = await prisma.bakeryOrder.count({ where: { supplierId: id } });
    if (orders > 0) throw new HttpError(409, `NCC này đã có ${orders} đơn bánh nên không xoá được`);
  },
});
