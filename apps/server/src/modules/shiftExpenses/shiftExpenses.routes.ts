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
  shiftExpenseBulkImportSchema,
  shiftExpenseCreateSchema,
  shiftExpenseImageUploadSchema,
  type ShiftExpenseInput,
} from "./shiftExpenses.schemas";

export const shiftExpensesRouter = Router();

// Danh sách chỉ đếm ảnh, KHÔNG ký URL: 20 dòng × 5 ảnh là 100 chữ ký mỗi lần tải danh sách trong
// khi phần lớn người xem không mở ảnh nào. URL chỉ ký ở GET /:id/images.
const listInclude = {
  createdBy: { select: { id: true, name: true } },
  _count: { select: { images: true } },
};

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

/** Phẳng hoá _count của Prisma thành imageCount để payload API không lộ hình dạng truy vấn. */
function toApiRow<T extends { _count: { images: number } }>({ _count, ...row }: T) {
  return { ...row, imageCount: _count.images };
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

  res.json({ items: items.map(toApiRow), total, totalAmount: sum._sum.amount ?? 0, page, pageSize });
});

shiftExpensesRouter.post("/", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const data = shiftExpenseCreateSchema.parse(req.body);
  const item = await prisma.shiftExpense.create({
    data: toRow(data, req.user?.id),
    include: listInclude,
  });
  res.status(201).json(toApiRow(item));
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
  res.json(toApiRow(item));
});

shiftExpensesRouter.delete("/:id", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;

  const existing = await prisma.shiftExpense.findUnique({ where: { id }, include: { images: true } });
  if (!existing) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(existing, req.user, "Không tìm thấy khoản chi");

  // Đọc khoá ảnh TRƯỚC khi xoá: cascade dọn sạch dòng trong DB nên xoá xong là không còn gì để đọc,
  // mà cascade lại không đụng tới file trên R2.
  const keys = existing.images.map((image) => image.objectKey);

  await prisma.shiftExpense.delete({ where: { id } });
  await deleteImages(keys);

  res.status(204).end();
});

/** Nạp khoản chi và chặn ngoài phạm vi. Dùng chung cho cả ba route ảnh bên dưới. */
async function findOwnedExpense(id: string, user: Parameters<typeof assertOwner>[1]) {
  const expense = await prisma.shiftExpense.findUnique({ where: { id } });
  if (!expense) throw new HttpError(404, "Không tìm thấy khoản chi");
  assertOwner(expense, user, "Không tìm thấy khoản chi");
  return expense;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh — gọi khi người dùng bấm mở ảnh, không phải mỗi lần tải danh sách.
shiftExpensesRouter.get("/:id/images", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  await findOwnedExpense(req.params.id as string, req.user);

  const images = await prisma.shiftExpenseImage.findMany({
    where: { shiftExpenseId: req.params.id as string },
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

// Quyền suy theo method nên POST ảnh = SHIFT_EXPENSES.ADD, cố ý: người chỉ có quyền Thêm phải đính
// được ảnh cho khoản chi mình vừa tạo. Đòi EDIT ở đây là chặn đứng luồng tạo mới.
shiftExpensesRouter.post("/:id/images", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }

  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);
  const { images } = shiftExpenseImageUploadSchema.parse(req.body);

  const existingCount = await prisma.shiftExpenseImage.count({ where: { shiftExpenseId: id } });
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
      const key = `shift-expenses/${id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi không ai biết.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.shiftExpenseImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      shiftExpenseId: id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });

  res.status(201).json({ created: uploaded.length });
});

shiftExpensesRouter.delete("/:id/images/:imageId", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);

  const image = await prisma.shiftExpenseImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả shiftExpenseId: id ảnh của khoản chi khác thì coi như không tồn tại.
  if (!image || image.shiftExpenseId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.shiftExpenseImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);

  res.status(204).end();
});
