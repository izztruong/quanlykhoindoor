import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { shiftExpenseBulkImportSchema, shiftExpenseCreateSchema, type ShiftExpenseInput } from "./shiftExpenses.schemas";

export const shiftExpensesRouter = Router();

const listInclude = { createdBy: { select: { id: true, name: true } } };

/** Thành tiền chốt ở server, không tin số client gửi lên — giống costAmount của phiếu nhập/xuất. */
function toRow(data: ShiftExpenseInput, createdById?: string) {
  return {
    spentAt: data.spentAt,
    type: data.type,
    content: data.content,
    unit: data.unit || null,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    amount: data.quantity * data.unitPrice,
    note: data.note || null,
    createdById,
  };
}

shiftExpensesRouter.get("/", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { search, createdById, type } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  // Chú kiểu tường minh: không có nó, TypeScript nới literal đã lọc của `type` thành `string` rồi
  // Prisma từ chối cả where — mà vì `where` là biến nên phép kiểm thuộc tính thừa không bắt được,
  // client Prisma cũ sẽ cho qua im lặng.
  const where: Prisma.ShiftExpenseWhereInput = {
    spentAt: from || to ? { gte: from, lte: to } : undefined,
    // Giá trị lạ thì bỏ qua bộ lọc thay vì trả lỗi — query string do người dùng gõ tay được.
    type: type === "MATERIAL" || type === "OTHER" ? type : undefined,
    content: search ? { contains: search, mode: "insensitive" } : undefined,
    // Phạm vi SELF chỉ thấy khoản chi của mình; ALL thấy hết, lọc theo quán qua ?createdById=.
    createdById: ownerWhere(req.user, createdById),
  };

  const [items, total, sum] = await Promise.all([
    prisma.shiftExpense.findMany({
      where,
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: listInclude,
    }),
    prisma.shiftExpense.count({ where }),
    // Tổng chi phải là tổng của CẢ bộ lọc, không phải của trang đang xem.
    prisma.shiftExpense.aggregate({ where, _sum: { amount: true } }),
  ]);

  res.json({ items, total, totalAmount: sum._sum.amount ?? 0, page, pageSize });
});

shiftExpensesRouter.post("/", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const data = shiftExpenseCreateSchema.parse(req.body);
  const item = await prisma.shiftExpense.create({
    data: toRow(data, req.user?.id),
    include: listInclude,
  });
  res.status(201).json(item);
});

// Nhập từ Excel. Khác bulk-import của crudFactory: khoản chi không có khoá tự nhiên (không có mã
// phiếu) để so trùng, nên đây là THÊM MỚI thuần — nhập lại cùng một file sẽ tạo thêm một bộ dòng.
// Giao diện phải nói rõ điều đó. Ghi một lần bằng createMany để cả file vào hết hoặc không dòng nào vào.
shiftExpensesRouter.post("/bulk-import", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const { items } = shiftExpenseBulkImportSchema.parse(req.body);
  const result = await prisma.shiftExpense.createMany({
    data: items.map((item) => toRow(item, req.user?.id)),
  });
  res.status(201).json({ created: result.count });
});

// Khác phiếu kiểm/phiếu huỷ: sổ chi hay gõ nhầm số nên vai trò "Quán" mặc định có sẵn
// SHIFT_EXPENSES.EDIT/DELETE — sửa/xoá được dòng của mình, phạm vi ALL thì đụng được tất cả.
shiftExpensesRouter.put("/:id", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;
  const data = shiftExpenseCreateSchema.parse(req.body);

  const existing = await prisma.shiftExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(existing, req.user, "Không tìm thấy khoản chi");

  // createdById giữ nguyên chủ cũ: sửa hộ thì khoản chi vẫn thuộc về quán đã ghi.
  const { createdById: _ignored, ...row } = toRow(data);
  const item = await prisma.shiftExpense.update({ where: { id }, data: row, include: listInclude });
  res.json(item);
});

shiftExpensesRouter.delete("/:id", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;

  const existing = await prisma.shiftExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(existing, req.user, "Không tìm thấy khoản chi");

  await prisma.shiftExpense.delete({ where: { id } });
  res.status(204).end();
});
