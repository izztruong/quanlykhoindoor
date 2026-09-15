import { prisma } from "../../config/db";
import type { ExpensePayer, ExpenseProposalStatus, Prisma } from "../../generated/prisma/client";
import { assertOwner, type AuthUser } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import type { ExpenseProposalInput } from "./expenseProposals.schemas";

export const NOT_FOUND_MESSAGE = "Không tìm thấy phiếu đề xuất chi";

const userName = { select: { id: true, name: true } };

export const expenseProposalListInclude = { createdBy: userName, shop: userName } satisfies Prisma.ExpenseProposalInclude;

export const expenseProposalDetailInclude = {
  createdBy: userName,
  shop: userName,
  approvedBy: userName,
  advancedBy: userName,
  spentBy: userName,
  items: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ExpenseProposalInclude;

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * Chuyển dữ liệu form thành cột để ghi. Thành tiền, tổng và tiền tạm ứng chốt ở server, không tin
 * số client gửi. Người lập tự chi thì ép cả ba cột tạm ứng về null, kể cả khi client có gửi.
 */
export function toProposalData(data: ExpenseProposalInput) {
  const items = data.items.map((item, index) => ({
    sortOrder: index,
    content: item.content,
    unitPrice: item.unitPrice,
    unit: item.unit || null,
    quantity: item.quantity,
    amount: roundMoney(item.unitPrice * item.quantity),
    note: item.note || null,
  }));
  const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const isAccountant = data.payer === "ACCOUNTANT";
  const advancePercent = isAccountant ? (data.advancePercent ?? null) : null;

  return {
    header: {
      proposalDate: data.proposalDate,
      payer: data.payer,
      shopId: data.shopId,
      purpose: data.purpose,
      totalAmount,
      advancePercent,
      // Tạm ứng làm tròn tới đồng — không có ai ứng lẻ hào.
      advanceAmount: advancePercent !== null ? Math.round((totalAmount * advancePercent) / 100) : null,
      invoiceDueDate: isAccountant ? (data.invoiceDueDate ?? null) : null,
    },
    items,
  };
}

/** Quán chi phải là tài khoản thuộc vai trò "là quán" — ô chọn chỉ liệt kê những tài khoản đó, server kiểm lại. */
export async function assertShop(shopId: string) {
  const shop = await prisma.user.findFirst({ where: { id: shopId, role: { isShop: true } }, select: { id: true } });
  if (!shop) throw new HttpError(400, "Quán chi không hợp lệ");
}

/** Đọc phiếu và chốt phạm vi quán — ngoài phạm vi trả 404 như không tồn tại. */
export async function findOwnedProposal(id: string, user: AuthUser | undefined) {
  const proposal = await prisma.expenseProposal.findUnique({ where: { id } });
  if (!proposal) throw new HttpError(404, NOT_FOUND_MESSAGE);
  assertOwner(proposal, user, NOT_FOUND_MESSAGE);
  return proposal;
}

type Transition = {
  from: ExpenseProposalStatus;
  /** Bỏ trống = áp cho cả hai kiểu người chi. */
  payer?: ExpensePayer;
  to: ExpenseProposalStatus;
};

/**
 * Đổi trạng thái có điều kiện trong CÙNG một câu UPDATE: chỉ ghi khi phiếu vẫn đang ở trạng thái
 * nguồn. Hai người bấm cùng lúc thì người sau nhận 409 thay vì ghi đè quyết định của người trước.
 */
export async function transitionProposal(
  id: string,
  user: AuthUser | undefined,
  transitions: Transition[],
  data: Prisma.ExpenseProposalUncheckedUpdateManyInput,
) {
  const proposal = await findOwnedProposal(id, user);
  const match = transitions.find((t) => t.from === proposal.status && (!t.payer || t.payer === proposal.payer));
  if (!match) throw new HttpError(409, "Phiếu không ở trạng thái cho phép thao tác này, vui lòng tải lại trang");

  const { count } = await prisma.expenseProposal.updateMany({
    where: { id, status: match.from, payer: match.payer },
    data: { ...data, status: match.to },
  });
  if (count === 0) throw new HttpError(409, "Phiếu vừa được người khác cập nhật, vui lòng tải lại trang");

  return prisma.expenseProposal.findUniqueOrThrow({ where: { id }, include: expenseProposalDetailInclude });
}
