import { prisma } from "../../../config/db";
import type { Prisma } from "../../../generated/prisma/client";
import { capRows, dateColumnRange, dateRangeInput, defineTool, EXPENSE_ROW_DOC, formatDateColumn, num, shopIdParam, type ExpenseRow } from "../shared";

export const expenseProposalSpentItems = defineTool({
  name: "expense_proposal_spent_items",
  title: "Đề xuất chi — hạng mục thực chi",
  description:
    "Hạng mục THỰC CHI của các phiếu đề xuất chi đã Hoàn thành (phiếu chưa hoàn thành không có ở đây). " +
    "Ngày = ngày trên phiếu; quán = Quán chi của phiếu. " +
    `${EXPENSE_ROW_DOC} Thêm: purpose (mục đích của phiếu), invoiceDate (ngày nộp hoá đơn).`,
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const where: Prisma.ExpenseProposalSpentItemWhereInput = {
      expenseProposal: { status: "SPENT", proposalDate: dateColumnRange(from, to), shopId },
    };
    const items = await prisma.expenseProposalSpentItem.findMany({
      where,
      orderBy: [{ expenseProposal: { proposalDate: "asc" } }, { expenseProposal: { code: "asc" } }, { sortOrder: "asc" }],
      include: {
        expenseProposal: {
          select: { code: true, proposalDate: true, purpose: true, invoiceDate: true, shop: { select: { name: true } } },
        },
      },
    });
    const rows: (ExpenseRow & { purpose: string; invoiceDate: string | null })[] = items.map((it) => ({
      date: formatDateColumn(it.expenseProposal.proposalDate),
      name: it.content,
      unit: it.unit,
      quantity: num(it.quantity),
      unitPrice: num(it.unitPrice),
      amount: num(it.amount),
      source: "Đề xuất chi",
      docCode: it.expenseProposal.code,
      note: it.note,
      shop: it.expenseProposal.shop?.name ?? null,
      purpose: it.expenseProposal.purpose,
      invoiceDate: formatDateColumn(it.expenseProposal.invoiceDate),
    }));
    const sum = await prisma.expenseProposalSpentItem.aggregate({ where, _sum: { amount: true } });
    return { totalAmount: num(sum._sum.amount) ?? 0, ...capRows(rows) };
  },
});
