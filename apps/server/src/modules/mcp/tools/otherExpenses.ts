import { prisma } from "../../../config/db";
import type { Prisma } from "../../../generated/prisma/client";
import { capRows, dateColumnRange, dateRangeInput, defineTool, EXPENSE_ROW_DOC, formatDateColumn, num, shopIdParam, type ExpenseRow } from "../shared";

export const otherExpenses = defineTool({
  name: "other_expenses",
  title: "Chi ngoài",
  description:
    "Các khoản trong sổ Chi ngoài theo ngày chi. Quán = trường \"Quán chi\" của khoản chi " +
    "(có thể trống ở khoản cũ — khi lọc shopId thì khoản trống quán bị loại). " +
    `${EXPENSE_ROW_DOC} Thêm: createdBy (người gõ vào sổ, có thể khác quán).`,
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const where: Prisma.OtherExpenseWhereInput = { spentAt: dateColumnRange(from, to), shopId };
    const items = await prisma.otherExpense.findMany({
      where,
      orderBy: [{ spentAt: "asc" }, { createdAt: "asc" }],
      include: { shop: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    const rows: (ExpenseRow & { createdBy: string | null })[] = items.map((it) => ({
      date: formatDateColumn(it.spentAt),
      name: it.content,
      unit: it.unit,
      quantity: num(it.quantity),
      unitPrice: num(it.unitPrice),
      amount: num(it.amount),
      source: "Chi ngoài",
      docCode: null,
      note: it.note,
      shop: it.shop?.name ?? null,
      createdBy: it.createdBy?.name ?? null,
    }));
    const sum = await prisma.otherExpense.aggregate({ where, _sum: { amount: true } });
    return { totalAmount: num(sum._sum.amount) ?? 0, ...capRows(rows) };
  },
});
