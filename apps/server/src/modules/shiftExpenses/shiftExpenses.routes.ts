import { Router } from "express";
import { prisma } from "../../config/db";
import type { AuthUser } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { shiftExpenseBulkImportSchema, shiftExpenseCreateSchema, type ShiftExpenseInput } from "./shiftExpenses.schemas";

export const shiftExpensesRouter = Router();

const listInclude = { createdBy: { select: { id: true, name: true } } };

// Khác phiếu kiểm/phiếu huỷ (chỉ admin được sửa): sổ chi hay gõ nhầm số nên quán tự sửa/xoá dòng
// của mình được, admin thì đụng được tất cả.
function assertOwnership(expense: { createdById: string | null }, user?: AuthUser) {
  if (user?.role !== "ADMIN" && expense.createdById !== user?.id) {
    throw new HttpError(403, "Bạn không có quyền truy cập khoản chi này");
  }
}

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

shiftExpensesRouter.get("/", async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { search, createdById, type } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    spentAt: from || to ? { gte: from, lte: to } : undefined,
    type: type === "MATERIAL" || type === "OTHER" ? type : undefined,
    content: search ? { contains: search, mode: "insensitive" as const } : undefined,
    // Staff chỉ thấy khoản chi của chính mình; admin thấy hết, lọc theo quán qua ?createdById=.
    createdById: req.user?.role === "ADMIN" ? createdById || undefined : req.user?.id,
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

shiftExpensesRouter.post("/", async (req, res) => {
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
shiftExpensesRouter.post("/bulk-import", async (req, res) => {
  const { items } = shiftExpenseBulkImportSchema.parse(req.body);
  const result = await prisma.shiftExpense.createMany({
    data: items.map((item) => toRow(item, req.user?.id)),
  });
  res.status(201).json({ created: result.count });
});

shiftExpensesRouter.put("/:id", async (req, res) => {
  const id = req.params.id as string;
  const data = shiftExpenseCreateSchema.parse(req.body);

  const existing = await prisma.shiftExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwnership(existing, req.user);

  // createdById giữ nguyên chủ cũ: sửa hộ thì khoản chi vẫn thuộc về quán đã ghi.
  const { createdById: _ignored, ...row } = toRow(data);
  const item = await prisma.shiftExpense.update({ where: { id }, data: row, include: listInclude });
  res.json(item);
});

shiftExpensesRouter.delete("/:id", async (req, res) => {
  const id = req.params.id as string;

  const existing = await prisma.shiftExpense.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwnership(existing, req.user);

  await prisma.shiftExpense.delete({ where: { id } });
  res.status(204).end();
});
