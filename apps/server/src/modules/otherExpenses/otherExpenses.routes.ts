import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import {
  MAX_IMAGES_PER_EXPENSE,
  MAX_IMAGE_BYTES,
  otherExpenseBulkImportSchema,
  otherExpenseCreateSchema,
  otherExpenseImageUploadSchema,
  type OtherExpenseInput,
} from "./otherExpenses.schemas";

export const otherExpensesRouter = Router();

// Danh sách chỉ đếm ảnh, KHÔNG ký URL: 20 dòng × 5 ảnh là 100 chữ ký mỗi lần tải danh sách trong
// khi phần lớn người xem không mở ảnh nào. URL chỉ ký ở GET /:id/images.
const listInclude = {
  createdBy: { select: { id: true, name: true } },
  _count: { select: { images: true } },
};

/** Thành tiền chốt ở server, không tin số client gửi lên — giống costAmount của phiếu nhập/xuất. */
function toRow(data: OtherExpenseInput, createdById?: string) {
  return {
    spentAt: data.spentAt,
    content: data.content,
    unit: data.unit || null,
    quantity: data.quantity,
    unitPrice: data.unitPrice,
    amount: data.quantity * data.unitPrice,
    note: data.note || null,
    createdById,
  };
}

/** Phẳng hoá _count của Prisma thành imageCount để payload API không lộ hình dạng truy vấn. */
function toApiRow<T extends { _count: { images: number } }>({ _count, ...row }: T) {
  return { ...row, imageCount: _count.images };
}

/** Nạp khoản chi và chặn ngoài phạm vi. Dùng chung cho ba route ảnh bên dưới. */
async function findOwnedExpense(id: string, user: Parameters<typeof assertOwner>[1]) {
  const expense = await prisma.otherExpense.findUnique({ where: { id } });
  if (!expense) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(expense, user, "Không tìm thấy khoản chi");
  return expense;
}

otherExpensesRouter.get("/", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { search, createdById } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where: Prisma.OtherExpenseWhereInput = {
    spentAt: from || to ? { gte: from, lte: to } : undefined,
    content: search ? { contains: search, mode: "insensitive" } : undefined,
    // Phạm vi SELF chỉ thấy khoản chi của mình; ALL thấy hết, lọc theo người tạo qua ?createdById=.
    createdById: ownerWhere(req.user, createdById),
  };

  const [items, total, sum] = await Promise.all([
    prisma.otherExpense.findMany({
      where,
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      include: listInclude,
    }),
    prisma.otherExpense.count({ where }),
    // Tổng tiền phải là tổng của CẢ bộ lọc, không phải của trang đang xem.
    prisma.otherExpense.aggregate({ where, _sum: { amount: true } }),
  ]);

  res.json({ items: items.map(toApiRow), total, totalAmount: sum._sum.amount ?? 0, page, pageSize });
});

otherExpensesRouter.post("/", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const data = otherExpenseCreateSchema.parse(req.body);
  const item = await prisma.otherExpense.create({
    data: toRow(data, req.user?.id),
    include: listInclude,
  });
  res.status(201).json(toApiRow(item));
});

// Nhập từ Excel. Khoản chi ngoài không có khoá tự nhiên (không có mã phiếu) để so trùng, nên đây là
// THÊM MỚI thuần — nhập lại cùng một file sẽ tạo thêm một bộ dòng. Giao diện phải nói rõ điều đó.
// Ghi một lần bằng createMany để cả file vào hết hoặc không dòng nào vào.
otherExpensesRouter.post("/bulk-import", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const { items } = otherExpenseBulkImportSchema.parse(req.body);
  const result = await prisma.otherExpense.createMany({
    data: items.map((item) => toRow(item, req.user?.id)),
  });
  res.status(201).json({ created: result.count });
});

otherExpensesRouter.put("/:id", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;
  const data = otherExpenseCreateSchema.parse(req.body);

  await findOwnedExpense(id, req.user);

  // createdById giữ nguyên chủ cũ: sửa hộ thì khoản chi vẫn thuộc về người đã ghi.
  const { createdById: _ignored, ...row } = toRow(data);
  const item = await prisma.otherExpense.update({ where: { id }, data: row, include: listInclude });
  res.json(toApiRow(item));
});

otherExpensesRouter.delete("/:id", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;

  const existing = await prisma.otherExpense.findUnique({ where: { id }, include: { images: true } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(existing, req.user, "Không tìm thấy khoản chi");

  // Đọc khoá ảnh TRƯỚC khi xoá: cascade dọn sạch dòng trong DB nên xoá xong là không còn gì để đọc,
  // mà cascade lại không đụng tới file trên R2.
  const keys = existing.images.map((image) => image.objectKey);

  await prisma.otherExpense.delete({ where: { id } });
  await deleteImages(keys);

  res.status(204).end();
});

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh — gọi khi người dùng bấm mở ảnh, không phải mỗi lần tải danh sách.
otherExpensesRouter.get("/:id/images", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  await findOwnedExpense(req.params.id as string, req.user);

  const images = await prisma.otherExpenseImage.findMany({
    where: { otherExpenseId: req.params.id as string },
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

// Quyền suy theo method nên POST ảnh = OTHER_EXPENSES.ADD, cố ý: người chỉ có quyền Thêm phải đính
// được ảnh cho khoản chi mình vừa tạo. Đòi EDIT ở đây là chặn đứng luồng tạo mới.
otherExpensesRouter.post("/:id/images", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }

  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);
  const { images } = otherExpenseImageUploadSchema.parse(req.body);

  const existingCount = await prisma.otherExpenseImage.count({ where: { otherExpenseId: id } });
  if (existingCount + images.length > MAX_IMAGES_PER_EXPENSE) {
    throw new HttpError(
      400,
      `Mỗi khoản chi tối đa ${MAX_IMAGES_PER_EXPENSE} ảnh (đang có ${existingCount}, chọn thêm ${images.length})`,
    );
  }

  // Giải base64 và kiểm kích thước THẬT: chuỗi base64 dài hơn dữ liệu gốc khoảng 33% nên đo độ dài
  // chuỗi là đo nhầm. Kiểm hết mọi ảnh trước khi đẩy ảnh đầu tiên lên, để file lỗi không kịp sinh rác.
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
      const key = `other-expenses/${id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi không ai biết.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.otherExpenseImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      otherExpenseId: id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });

  res.status(201).json({ created: uploaded.length });
});

otherExpensesRouter.delete("/:id/images/:imageId", requirePermission("OTHER_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);

  const image = await prisma.otherExpenseImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả otherExpenseId: id ảnh của khoản chi khác thì coi như không tồn tại.
  if (!image || image.otherExpenseId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.otherExpenseImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);

  res.status(204).end();
});
