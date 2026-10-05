import { prisma } from "../../../config/db";
import { defineTool } from "../shared";

export const listShops = defineTool({
  name: "list_shops",
  title: "Danh sách quán",
  description:
    "Liệt kê các quán (tài khoản thuộc vai trò được đánh dấu là quán): id (mã quán) và name (tên quán). " +
    "Dùng id ở đây cho tham số shopId của các tool khác.",
  input: {},
  run: async () => {
    const shops = await prisma.user.findMany({
      where: { role: { isShop: true } },
      // Cố ý không trả email: báo cáo không cần, mà kết quả tool nằm lại trong lịch sử chat claude.ai.
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return { shops };
  },
});
