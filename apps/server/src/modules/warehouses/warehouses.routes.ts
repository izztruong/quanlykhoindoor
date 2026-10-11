import { z } from "zod";
import { prisma } from "../../config/db";
import { createCrudRouter } from "../../utils/crudFactory";
import { HttpError } from "../../utils/httpError";

/**
 * `shopUserId` nhận "" từ ô select của web ("Không có") và quy về null — để trống là kho tổng, không
 * thuộc quán nào. Check Cost chỉ đọc kho CÓ `shopUserId`.
 */
const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional(),
  // "" (ô select "Không có") và null đều nghĩa là bỏ gán quán. `undefined` thì để nguyên để zod bỏ
  // khoá khỏi payload — ở PUT, Prisma hiểu khoá vắng mặt là "không sửa trường này"; quy nó về null
  // sẽ làm mọi lần sửa tên kho âm thầm gỡ luôn quán khỏi kho đó.
  shopUserId: z
    .string()
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
});

const shopInclude = { shopUser: { select: { id: true, name: true } } };

/**
 * Hai ràng buộc phải tra DB mới biết, nên không nằm trong zod được:
 *  1. Kho chỉ gán cho tài khoản thuộc vai trò "Là quán" — gán cho tài khoản kế toán thì ô chọn quán
 *     ở các form khác không bao giờ hiện nó, mà Check Cost thì cứ đi tìm kho của nó.
 *  2. Một quán đúng một kho. Cột đã có `@unique`, nhưng để Prisma nổ P2002 là người dùng nhận một
 *     câu lỗi thô; chặn ở đây để trả 409 tiếng Việt kèm tên kho đang giữ.
 */
async function assertAssignableShop(shopUserId: string | null | undefined, warehouseId?: string) {
  if (!shopUserId) return;

  const user = await prisma.user.findUnique({
    where: { id: shopUserId },
    select: { name: true, role: { select: { isShop: true } } },
  });
  if (!user) throw new HttpError(400, "Không tìm thấy tài khoản quán được chọn");
  if (!user.role.isShop) {
    throw new HttpError(400, `Tài khoản "${user.name}" không thuộc vai trò được đánh dấu "Là quán"`);
  }

  const taken = await prisma.warehouse.findUnique({ where: { shopUserId }, select: { id: true, name: true } });
  if (taken && taken.id !== warehouseId) {
    throw new HttpError(409, `Quán "${user.name}" đã có kho "${taken.name}". Mỗi quán chỉ được một kho.`);
  }
}

export const warehousesRouter = createCrudRouter(prisma.warehouse, {
  createSchema,
  updateSchema: createSchema.partial(),
  searchFields: ["code", "name"],
  resource: "WAREHOUSES",
  publicRead: true,
  include: shopInclude,
  beforeWrite: (data, { id }) => assertAssignableShop(data.shopUserId, id),
  beforeDelete: async (id) => {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      select: { shopUser: { select: { name: true } } },
    });
    // Khoá ngoại không đỡ được ca này: kho của quán CHƯA có phiếu nhập nào vẫn xoá được, và quán đó
    // mất nguồn cột "Nhận trong kỳ" của Check Cost mà không có dấu hiệu gì.
    if (warehouse?.shopUser) {
      throw new HttpError(
        409,
        `Kho này đang thuộc quán "${warehouse.shopUser.name}" — bỏ gán quán trước khi xoá, ` +
          `nếu không Check Cost của quán đó sẽ không còn nguồn hàng nhập.`,
      );
    }
  },
});
