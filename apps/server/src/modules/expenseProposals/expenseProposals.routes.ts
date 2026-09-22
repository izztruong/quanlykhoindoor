import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { HttpError } from "../../utils/httpError";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { expenseProposalNotifications } from "../notifications/notifications.service";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PROPOSAL,
  expenseProposalAdvanceSchema,
  expenseProposalCompleteSchema,
  expenseProposalImageUploadSchema,
  expenseProposalRejectSchema,
  expenseProposalRevisionSchema,
  expenseProposalSchema,
} from "./expenseProposals.schemas";
import {
  assertParties,
  completeProposal,
  decideProposal,
  decideRevision,
  expenseProposalDetailInclude,
  expenseProposalListInclude,
  findOwnedProposal,
  NOT_FOUND_MESSAGE,
  recordAdvance,
  submitRevision,
  toProposalData,
} from "./expenseProposals.service";

export const expenseProposalsRouter = Router();

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "ADVANCED", "REAPPROVAL", "SPENT"] as const;

expenseProposalsRouter.get("/", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { status, createdById } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where: Prisma.ExpenseProposalWhereInput = {
    proposalDate: from || to ? { gte: from, lte: to } : undefined,
    // Giá trị lạ thì bỏ qua bộ lọc — query string gõ tay được.
    status: STATUSES.find((s) => s === status),
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
  // Gửi sau khi đã ghi xong, không await — lỗi thông báo không được làm hỏng việc lập phiếu.
  if (req.user) expenseProposalNotifications.created(item, req.user);
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


// --- Duyệt lần đầu: quyền Duyệt VÀ phải là người duyệt của phiếu (hoặc vai trò hệ thống) ---

expenseProposalsRouter.post("/:id/approve", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const item = await decideProposal(req.params.id as string, req.user, "APPROVED");
  // Gửi sau khi đã ghi xong, không await — lỗi thông báo không được làm hỏng thao tác chính.
  if (req.user) expenseProposalNotifications.decided(item, req.user, "APPROVED");
  res.json(item);
});

expenseProposalsRouter.post("/:id/reject", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const { reason } = expenseProposalRejectSchema.parse(req.body);
  const item = await decideProposal(req.params.id as string, req.user, "REJECTED", reason);
  if (req.user) expenseProposalNotifications.decided(item, req.user, "REJECTED");
  res.json(item);
});

// --- Tạm ứng: lần đầu (Đã duyệt → Đã tạm ứng) và tạm ứng thêm (giữ Đã tạm ứng) ---

expenseProposalsRouter.post("/:id/advance", requirePermission("EXPENSE_PROPOSALS", "ADVANCE"), async (req, res) => {
  const { amount, note } = expenseProposalAdvanceSchema.parse(req.body);
  const { item, amount: recorded } = await recordAdvance(req.params.id as string, req.user, amount, note);
  if (req.user) expenseProposalNotifications.advanced(item, req.user, recorded);
  res.json(item);
});

// --- Duyệt bổ sung bảng hạng mục dự kiến ---

// Gửi bảng mới = sửa phiếu, nên cần EDIT (vai trò Quán có sẵn); findOwnedProposal chặn phiếu ngoài phạm vi.
expenseProposalsRouter.post("/:id/revision", requirePermission("EXPENSE_PROPOSALS", "EDIT"), async (req, res) => {
  const { items } = expenseProposalRevisionSchema.parse(req.body);
  const item = await submitRevision(req.params.id as string, req.user, items);
  if (req.user) expenseProposalNotifications.revisionSubmitted(item, req.user);
  res.json(item);
});

expenseProposalsRouter.post("/:id/revision/approve", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const item = await decideRevision(req.params.id as string, req.user, "APPROVED");
  if (req.user) expenseProposalNotifications.revisionDecided(item, req.user, "APPROVED");
  res.json(item);
});

expenseProposalsRouter.post("/:id/revision/reject", requirePermission("EXPENSE_PROPOSALS", "APPROVE"), async (req, res) => {
  const { reason } = expenseProposalRejectSchema.parse(req.body);
  const item = await decideRevision(req.params.id as string, req.user, "REJECTED", reason);
  if (req.user) expenseProposalNotifications.revisionDecided(item, req.user, "REJECTED");
  res.json(item);
});

// --- Hoàn thành: hạng mục thực chi + ngày nộp hoá đơn; ảnh chứng từ đính riêng ngay sau đó ---

expenseProposalsRouter.post("/:id/complete", requirePermission("EXPENSE_PROPOSALS", "COMPLETE"), async (req, res) => {
  const { items, invoiceDate } = expenseProposalCompleteSchema.parse(req.body);
  const item = await completeProposal(req.params.id as string, req.user, items, invoiceDate);
  if (req.user) expenseProposalNotifications.completed(item, req.user);
  res.json(item);
});

// --- Ảnh chứng từ: cùng khuôn Chi chốt ca (file trên R2, URL ký có hạn) ---

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh — gọi khi người dùng mở phần chứng từ, không phải mỗi lần tải phiếu.
expenseProposalsRouter.get("/:id/images", requirePermission("EXPENSE_PROPOSALS"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedProposal(id, req.user);

  const images = await prisma.expenseProposalImage.findMany({
    where: { expenseProposalId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const withUrls = await Promise.all(
    images.map(async (image) => ({
      id: image.id,
      contentType: image.contentType,
      size: image.size,
      url: await signedImageUrl(image.objectKey),
    })),
  );
  res.json(withUrls);
});

// Chứng từ thuộc bước quyết toán nên chỉ đính được khi phiếu đã Hoàn thành, và cần quyền Hoàn thành.
expenseProposalsRouter.post("/:id/images", requirePermission("EXPENSE_PROPOSALS", "COMPLETE"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }
  const id = req.params.id as string;
  const proposal = await findOwnedProposal(id, req.user);
  if (proposal.status !== "SPENT") throw new HttpError(409, "Chỉ đính chứng từ cho phiếu đã hoàn thành");
  const { images } = expenseProposalImageUploadSchema.parse(req.body);

  const existingCount = await prisma.expenseProposalImage.count({ where: { expenseProposalId: id } });
  if (existingCount + images.length > MAX_IMAGES_PER_PROPOSAL) {
    throw new HttpError(
      400,
      `Mỗi phiếu tối đa ${MAX_IMAGES_PER_PROPOSAL} ảnh chứng từ (đang có ${existingCount}, chọn thêm ${images.length})`,
    );
  }

  // Giải base64 và kiểm kích thước THẬT (chuỗi base64 dài hơn dữ liệu gốc ~33%). Kiểm hết trước khi
  // đẩy ảnh đầu tiên lên, để file lỗi không kịp sinh rác trên R2.
  const decoded = images.map((image, index) => {
    const buffer = Buffer.from(image.dataBase64, "base64");
    if (buffer.length === 0) throw new HttpError(400, `Ảnh ${index + 1} không đọc được`);
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new HttpError(400, `Ảnh ${index + 1} nặng quá ${Math.round(MAX_IMAGE_BYTES / 1000)} KB`);
    }
    return { buffer, contentType: image.contentType };
  });

  const uploaded: string[] = [];
  try {
    for (const image of decoded) {
      const key = `expense-proposals/${id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.expenseProposalImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      expenseProposalId: id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });
  res.status(201).json({ created: uploaded.length });
});

expenseProposalsRouter.delete("/:id/images/:imageId", requirePermission("EXPENSE_PROPOSALS", "COMPLETE"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedProposal(id, req.user);

  const image = await prisma.expenseProposalImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả expenseProposalId: id ảnh của phiếu khác thì coi như không tồn tại.
  if (!image || image.expenseProposalId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.expenseProposalImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);
  res.status(204).end();
});
