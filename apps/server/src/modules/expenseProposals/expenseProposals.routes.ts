import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { EXPENSE_PROPOSAL_CATEGORIES, expenseProposalRejectSchema, expenseProposalSchema } from "./expenseProposals.schemas";
import {
  assertParties,
  expenseProposalDetailInclude,
  expenseProposalListInclude,
  findOwnedProposal,
  NOT_FOUND_MESSAGE,
  toProposalData,
  transitionProposal,
} from "./expenseProposals.service";

export const expenseProposalsRouter = Router();

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "ADVANCED", "SPENT"] as const;

expenseProposalsRouter.get("/", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { status, category, createdById } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where: Prisma.ExpenseProposalWhereInput = {
    proposalDate: from || to ? { gte: from, lte: to } : undefined,
    // Giá trị lạ thì bỏ qua bộ lọc — query string gõ tay được.
    status: STATUSES.find((s) => s === status),
    category: EXPENSE_PROPOSAL_CATEGORIES.find((c) => c === category),
    // Phạm vi SELF chỉ thấy phiếu của mình; ALL thấy hết, lọc theo quán qua ?createdById=.
    createdById: ownerWhere(req.user, createdById),
  };

  const [items, total] = await Promise.all([
    prisma.expenseProposal.findMany({
      where,
      orderBy: [{ proposalDate: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: expenseProposalListInclude,
    }),
    prisma.expenseProposal.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

expenseProposalsRouter.get("/:id", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const item = await prisma.expenseProposal.findUnique({ where: { id: req.params.id }, include: expenseProposalDetailInclude });
  if (!item) throw new HttpError(404, NOT_FOUND_MESSAGE);
  assertOwner(item, req.user, NOT_FOUND_MESSAGE);
  res.json(item);
});

expenseProposalsRouter.post("/", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const data = expenseProposalSchema.parse(req.body);
  await assertParties(data);
  const { header, items } = toProposalData(data);
  const item = await prisma.expenseProposal.create({
    data: {
      ...header,
      code: generateCode("DX"),
      createdById: req.user?.id,
      items: { create: items },
    },
    include: expenseProposalDetailInclude,
  });
  res.status(201).json(item);
});

// Chỉ sửa được khi còn Chờ duyệt: đã duyệt mà vẫn sửa được số tiền thì quyết định duyệt mất nghĩa.
// createdById giữ nguyên — sửa hộ thì phiếu vẫn thuộc về quán đã lập.
expenseProposalsRouter.put("/:id", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const id = req.params.id as string;
  const data = expenseProposalSchema.parse(req.body);
  await assertParties(data);
  const { header, items } = toProposalData(data);

  const existing = await findOwnedProposal(id, req.user);
  if (existing.status !== "PENDING") throw new HttpError(409, "Chỉ sửa được phiếu đang chờ duyệt");

  const item = await prisma.$transaction(
    async (tx) => {
      // Điều kiện status nằm trong câu UPDATE: admin duyệt đúng lúc đang lưu thì không ghi đè.
      const { count } = await tx.expenseProposal.updateMany({ where: { id, status: "PENDING" }, data: header });
      if (count === 0) throw new HttpError(409, "Phiếu vừa được duyệt hoặc từ chối, không sửa được nữa");
      await tx.expenseProposalItem.deleteMany({ where: { expenseProposalId: id } });
      await tx.expenseProposalItem.createMany({ data: items.map((it) => ({ ...it, expenseProposalId: id })) });
      return tx.expenseProposal.findUniqueOrThrow({ where: { id }, include: expenseProposalDetailInclude });
    },
    { timeout: 20000 },
  );
  res.json(item);
});

expenseProposalsRouter.delete("/:id", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await findOwnedProposal(id, req.user);
  if (existing.status !== "PENDING") throw new HttpError(409, "Chỉ xoá được phiếu đang chờ duyệt");

  const { count } = await prisma.expenseProposal.deleteMany({ where: { id, status: "PENDING" } });
  if (count === 0) throw new HttpError(409, "Phiếu vừa được duyệt hoặc từ chối, không xoá được nữa");
  res.status(204).end();
});

expenseProposalsRouter.post("/:id/approve", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const item = await transitionProposal(req.params.id, req.user, [{ from: "PENDING", to: "APPROVED" }], {
    approvedById: req.user?.id,
    approvedAt: new Date(),
  });
  res.json(item);
});

expenseProposalsRouter.post("/:id/reject", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const { reason } = expenseProposalRejectSchema.parse(req.body);
  const item = await transitionProposal(req.params.id, req.user, [{ from: "PENDING", to: "REJECTED" }], {
    approvedById: req.user?.id,
    approvedAt: new Date(),
    rejectReason: reason,
  });
  res.json(item);
});

// Tạm ứng chỉ có ở phiếu kế toán chi.
expenseProposalsRouter.post("/:id/advance", requirePermission("EXPENSE_PROPOSALS", "PAY"), async (req, res) => {
  const item = await transitionProposal(
    req.params.id,
    req.user,
    [{ from: "APPROVED", payer: "ACCOUNTANT", to: "ADVANCED" }],
    { advancedById: req.user?.id, advancedAt: new Date() },
  );
  res.json(item);
});

// Người lập tự chi: Đã duyệt → Đã chi. Kế toán chi: phải tạm ứng trước rồi mới Đã chi.
expenseProposalsRouter.post("/:id/spend", requirePermission("EXPENSE_PROPOSALS", "PAY"), async (req, res) => {
  const item = await transitionProposal(
    req.params.id,
    req.user,
    [
      { from: "APPROVED", payer: "CREATOR", to: "SPENT" },
      { from: "ADVANCED", payer: "ACCOUNTANT", to: "SPENT" },
    ],
    { spentById: req.user?.id, spentAt: new Date() },
  );
  res.json(item);
});
