import { prisma } from "../../../config/db";
import type { Prisma } from "../../../generated/prisma/client";
import { capRows, dateColumnRange, dateRangeInput, defineTool, EXPENSE_ROW_DOC, formatDateColumn, num, shopIdParam, type ExpenseRow } from "../shared";

export const shiftExpenses = defineTool({
  name: "shift_expenses",
  title: "Chi chốt ca",
  description:
    "Các khoản chi tại quán (sổ Chi chốt ca) theo ngày chi. Quán = người lập khoản chi. " +
    `${EXPENSE_ROW_DOC} Thêm: type (MATERIAL = Loại chi NVL, OTHER = Khác — đúng như quán khai), ` +
    "paid (kế toán đã đánh dấu đã chi chưa).",
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const where: Prisma.ShiftExpenseWhereInput = { spentAt: dateColumnRange(from, to), createdById: shopId };
    const items = await prisma.shiftExpense.findMany({
      where,
      orderBy: [{ spentAt: "asc" }, { createdAt: "asc" }],
      include: { createdBy: { select: { name: true } } },
    });
    const rows: (ExpenseRow & { type: string; paid: boolean })[] = items.map((it) => ({
      date: formatDateColumn(it.spentAt),
      name: it.content,
      unit: it.unit,
      quantity: num(it.quantity),
      unitPrice: num(it.unitPrice),
      amount: num(it.amount),
      source: "Chi chốt ca",
      docCode: null,
      note: it.note,
      shop: it.createdBy?.name ?? null,
      type: it.type,
      paid: it.paidAt != null,
    }));
    const sum = await prisma.shiftExpense.aggregate({ where, _sum: { amount: true } });
    return { totalAmount: num(sum._sum.amount) ?? 0, ...capRows(rows) };
  },
});
