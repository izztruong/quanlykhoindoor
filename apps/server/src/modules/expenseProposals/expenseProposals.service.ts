import { prisma } from "../../config/db";
import { Prisma, type ExpenseProposal, type ExpenseProposalStatus } from "../../generated/prisma/client";
import { assertOwner, type AuthUser } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import type { ExpenseProposalInput, ExpenseProposalItemInput } from "./expenseProposals.schemas";

export const NOT_FOUND_MESSAGE = "Không tìm thấy phiếu đề xuất chi";
const STALE_MESSAGE = "Phiếu vừa được người khác cập nhật, vui lòng tải lại trang";
const WRONG_STATUS_MESSAGE = "Phiếu không ở trạng thái cho phép thao tác này, vui lòng tải lại trang";

const userName = { select: { id: true, name: true } };

export const expenseProposalListInclude = {
  createdBy: userName,
  shop: userName,
  approver: userName,
} satisfies Prisma.ExpenseProposalInclude;

export const expenseProposalDetailInclude = {
  createdBy: userName,
  shop: userName,
  approver: userName,
  approvedBy: userName,
  spentBy: userName,
  revisionDecidedBy: userName,
  items: { orderBy: { sortOrder: "asc" } },
  advances: { orderBy: { createdAt: "asc" }, include: { createdBy: userName } },
  spentItems: { orderBy: { sortOrder: "asc" } },
  // Chỉ đếm ảnh — URL ký có hạn chỉ sinh ở GET /:id/images, khi người xem thật sự mở ảnh.
  _count: { select: { images: true } },
} satisfies Prisma.ExpenseProposalInclude;

// So sánh tiền bằng số nguyên đồng×100: cộng số thực kiểu 0.1 + 0.2 không được phép làm lệch trần tạm ứng.
const toCents = (value: Prisma.Decimal | number | string | null | undefined) => Math.round(Number(value ?? 0) * 100);
const fromCents = (cents: number) => cents / 100;
const moneyFormat = new Intl.NumberFormat("vi-VN");

/** Dòng hạng mục (dự kiến hoặc thực chi) → cột để ghi. Thành tiền và tổng chốt ở server. */
export function toItemRows(items: ExpenseProposalItemInput[]) {
  const rows = items.map((item, index) => ({
    sortOrder: index,
    content: item.content,
    unitPrice: item.unitPrice,
    unit: item.unit || null,
    quantity: item.quantity,
    amount: fromCents(Math.round(item.unitPrice * item.quantity * 100)),
    note: item.note || null,
  }));
  const totalCents = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0);
  return { rows, total: fromCents(totalCents) };
}

type ItemRow = ReturnType<typeof toItemRows>["rows"][number];

/**
 * Chuyển dữ liệu form thành cột để ghi. Kế toán chi thì ép hai cột tạm ứng về null, kể cả khi client
 * có gửi. Số tiền đề nghị tạm ứng không được vượt tổng dự kiến — tổng do server tính nên kiểm ở đây.
 */
export function toProposalData(data: ExpenseProposalInput) {
  const { rows: items, total: totalAmount } = toItemRows(data.items);
  const isCreator = data.payer === "CREATOR";
  const advanceAmount = isCreator && data.advanceAmount !== undefined ? fromCents(toCents(data.advanceAmount)) : null;
  if (advanceAmount !== null && toCents(advanceAmount) > toCents(totalAmount)) {
    throw new HttpError(400, "Số tiền đề nghị tạm ứng không được vượt tổng dự kiến");
  }

  return {
    header: {
      proposalDate: data.proposalDate,
      payer: data.payer,
      category: data.category,
      shopId: data.shopId,
      approverId: data.approverId,
      purpose: data.purpose,
      totalAmount,
      advanceAmount,
      invoiceDueDate: isCreator ? (data.invoiceDueDate ?? null) : null,
    },
    items,
  };
}

/**
 * Quán chi phải là tài khoản thuộc vai trò "là quán", người duyệt phải là tài khoản KHÔNG phải quán —
 * ô chọn đã lọc sẵn, server kiểm lại.
 */
export async function assertParties(data: { shopId: string; approverId: string }) {
  const [shop, approver] = await Promise.all([
    prisma.user.findFirst({ where: { id: data.shopId, role: { isShop: true } }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: data.approverId, role: { isShop: false } }, select: { id: true } }),
  ]);
  if (!shop) throw new HttpError(400, "Quán chi không hợp lệ");
  if (!approver) throw new HttpError(400, "Người duyệt không hợp lệ");
}

/**
 * Duyệt/từ chối (lần đầu và bổ sung) chỉ dành cho đúng người duyệt của phiếu, hoặc vai trò hệ thống.
 * Chặn thêm này nằm SAU requirePermission("APPROVE"): có quyền Duyệt mà không phải người duyệt của
 * phiếu thì vẫn bị từ chối.
 */
export function assertCanApprove(proposal: Pick<ExpenseProposal, "approverId">, user: AuthUser | undefined) {
  if (user?.isSystem) return;
  if (!user || proposal.approverId !== user.id) {
    throw new HttpError(403, "Chỉ người duyệt của phiếu mới được duyệt hoặc từ chối");
  }
}

/** Đọc phiếu và chốt phạm vi quán — ngoài phạm vi trả 404 như không tồn tại. */
export async function findOwnedProposal(id: string, user: AuthUser | undefined) {
  const proposal = await prisma.expenseProposal.findUnique({ where: { id } });
  if (!proposal) throw new HttpError(404, NOT_FOUND_MESSAGE);
  assertOwner(proposal, user, NOT_FOUND_MESSAGE);
  return proposal;
}

type Tx = Prisma.TransactionClient;

/**
 * Chuyển trạng thái trong transaction: UPDATE có điều kiện trạng thái nguồn vừa chặn ghi đè (hai người
 * bấm cùng lúc thì người sau nhận 409) vừa KHOÁ dòng phiếu tới hết transaction — nhờ vậy phần kiểm
 * tổng tiền chạy sau đó không bị một request song song chen ngang.
 */
async function lockTransition(tx: Tx, id: string, from: ExpenseProposalStatus, data: Prisma.ExpenseProposalUncheckedUpdateManyInput) {
  const { count } = await tx.expenseProposal.updateMany({ where: { id, status: from }, data });
  if (count === 0) throw new HttpError(409, STALE_MESSAGE);
}

async function advancedCents(tx: Tx, id: string) {
  const agg = await tx.expenseProposalAdvance.aggregate({ where: { expenseProposalId: id }, _sum: { amount: true } });
  return toCents(agg._sum.amount);
}

const detail = (tx: Tx, id: string) => tx.expenseProposal.findUniqueOrThrow({ where: { id }, include: expenseProposalDetailInclude });

/** Duyệt / từ chối phiếu đang Chờ duyệt. */
export async function decideProposal(id: string, user: AuthUser | undefined, outcome: "APPROVED" | "REJECTED", reason?: string) {
  const proposal = await findOwnedProposal(id, user);
  assertCanApprove(proposal, user);
  if (proposal.status !== "PENDING") throw new HttpError(409, WRONG_STATUS_MESSAGE);

  return prisma.$transaction(async (tx) => {
    await lockTransition(tx, id, "PENDING", {
      status: outcome,
      approvedById: user?.id,
      approvedAt: new Date(),
      rejectReason: outcome === "REJECTED" ? reason : null,
    });
    return detail(tx, id);
  });
}

/**
 * Tạm ứng (lần đầu: Đã duyệt → Đã tạm ứng) hoặc tạm ứng thêm (giữ Đã tạm ứng). Lần đầu chỉ có ở phiếu
 * có số đề nghị tạm ứng — kế toán chi không có bước này. Tổng các lần không vượt tổng dự kiến.
 */
export async function recordAdvance(id: string, user: AuthUser | undefined, amount: number, note?: string) {
  const proposal = await findOwnedProposal(id, user);
  const isFirst = proposal.status === "APPROVED" && proposal.advanceAmount !== null;
  if (!isFirst && proposal.status !== "ADVANCED") throw new HttpError(409, WRONG_STATUS_MESSAGE);

  const amountCents = Math.round(amount * 100);
  const item = await prisma.$transaction(
    async (tx) => {
      await lockTransition(tx, id, proposal.status, { status: "ADVANCED" });
      const remaining = toCents(proposal.totalAmount) - (await advancedCents(tx, id));
      if (amountCents > remaining) {
        throw new HttpError(
          400,
          `Tổng tạm ứng không được vượt tổng dự kiến — còn được ứng ${moneyFormat.format(fromCents(Math.max(remaining, 0)))}đ`,
        );
      }
      await tx.expenseProposalAdvance.create({
        data: { expenseProposalId: id, amount: fromCents(amountCents), note: note || null, createdById: user?.id },
      });
      return detail(tx, id);
    },
    { timeout: 20000 },
  );
  return { item, amount: fromCents(amountCents) };
}

/**
 * Gửi bảng hạng mục dự kiến mới đi duyệt bổ sung. Bảng cũ giữ nguyên tới khi được duyệt; tổng mới
 * không được nhỏ hơn số đã tạm ứng.
 */
export async function submitRevision(id: string, user: AuthUser | undefined, items: ExpenseProposalItemInput[]) {
  const proposal = await findOwnedProposal(id, user);
  if (proposal.status !== "APPROVED" && proposal.status !== "ADVANCED") throw new HttpError(409, WRONG_STATUS_MESSAGE);
  const { rows, total } = toItemRows(items);

  return prisma.$transaction(
    async (tx) => {
      await lockTransition(tx, id, proposal.status, {
        status: "REAPPROVAL",
        pendingItems: rows,
        pendingTotal: total,
        revisionRejectReason: null,
        revisionDecidedById: null,
        revisionDecidedAt: null,
      });
      const advanced = await advancedCents(tx, id);
      if (toCents(total) < advanced) {
        throw new HttpError(
          400,
          `Tổng dự kiến mới không được nhỏ hơn số đã tạm ứng (${moneyFormat.format(fromCents(advanced))}đ)`,
        );
      }
      return detail(tx, id);
    },
    { timeout: 20000 },
  );
}

/**
 * Duyệt hoặc từ chối bảng hạng mục dự kiến đang chờ. Duyệt: thay bảng + tổng. Từ chối: bỏ bảng mới,
 * giữ bảng cũ. Cả hai đều trả phiếu về Đã tạm ứng nếu đã ứng, không thì Đã duyệt.
 */
export async function decideRevision(
  id: string,
  user: AuthUser | undefined,
  outcome: "APPROVED" | "REJECTED",
  reason?: string,
) {
  const proposal = await findOwnedProposal(id, user);
  assertCanApprove(proposal, user);
  if (proposal.status !== "REAPPROVAL") throw new HttpError(409, WRONG_STATUS_MESSAGE);

  return prisma.$transaction(
    async (tx) => {
      const hasAdvance = (await tx.expenseProposalAdvance.count({ where: { expenseProposalId: id } })) > 0;
      const approved = outcome === "APPROVED";
      await lockTransition(tx, id, "REAPPROVAL", {
        status: hasAdvance ? "ADVANCED" : "APPROVED",
        ...(approved ? { totalAmount: proposal.pendingTotal ?? proposal.totalAmount } : {}),
        pendingItems: Prisma.DbNull,
        pendingTotal: null,
        revisionRejectReason: approved ? null : reason,
        revisionDecidedById: user?.id,
        revisionDecidedAt: new Date(),
      });
      if (approved) {
        const rows = (proposal.pendingItems ?? []) as ItemRow[];
        await tx.expenseProposalItem.deleteMany({ where: { expenseProposalId: id } });
        await tx.expenseProposalItem.createMany({ data: rows.map((row) => ({ ...row, expenseProposalId: id })) });
      }
      return detail(tx, id);
    },
    { timeout: 20000 },
  );
}

/**
 * Hoàn thành: khai hạng mục thực chi + ngày nộp hoá đơn. Đi từ Đã duyệt (phiếu không có tạm ứng) hoặc
 * Đã tạm ứng. Thực chi vượt tổng dự kiến đã duyệt thì chặn — phải gửi duyệt bổ sung trước.
 */
export async function completeProposal(
  id: string,
  user: AuthUser | undefined,
  items: ExpenseProposalItemInput[],
  invoiceDate: Date,
) {
  const proposal = await findOwnedProposal(id, user);
  const fromApproved = proposal.status === "APPROVED" && proposal.advanceAmount === null;
  if (!fromApproved && proposal.status !== "ADVANCED") throw new HttpError(409, WRONG_STATUS_MESSAGE);

  const { rows, total } = toItemRows(items);
  if (toCents(total) > toCents(proposal.totalAmount)) {
    throw new HttpError(400, "Chi vượt dự kiến — hãy thêm hạng mục chi dự kiến để người duyệt duyệt trước");
  }

  return prisma.$transaction(
    async (tx) => {
      await lockTransition(tx, id, proposal.status, {
        status: "SPENT",
        spentAmount: total,
        invoiceDate,
        spentById: user?.id,
        spentAt: new Date(),
      });
      await tx.expenseProposalSpentItem.createMany({ data: rows.map((row) => ({ ...row, expenseProposalId: id })) });
      return detail(tx, id);
    },
    { timeout: 20000 },
  );
}
