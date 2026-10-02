import { prisma } from "../../../config/db";
import { defineTool } from "../shared";

export const listShops = defineTool({
  name: "list_shops",
  title: "Danh sách quán",
  description:
    "Liệt kê các quán (tài khoản thuộc vai trò được đánh dấu là quán): id, tên, email. " +
    "Dùng id ở đây cho tham số shopId của các tool khác.",
  input: {},
  run: async () => {
    const shops = await prisma.user.findMany({
      where: { role: { isShop: true } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return { shops };
  },
});
