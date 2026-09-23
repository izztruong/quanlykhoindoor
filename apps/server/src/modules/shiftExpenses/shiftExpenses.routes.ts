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
  paidBy: { select: { id: true, name: true } },
  _count: { select: { images: true } },
};

/** Thông báo dùng chung cho mọi đường sửa đổi bị dấu "đã chi" chặn lại. */
function paidLockMessage(action: string) {
  return `Khoản chi đã được đánh dấu đã chi nên không ${action} được nữa. Nhờ người phụ trách bỏ đánh dấu trước.`;
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

/** Phẳng hoá _count của Prisma thành imageCount để payload API không lộ hình dạng truy vấn. */
function toApiRow<T extends { _count: { images: number } }>({ _count, ...row }: T) {
  return { ...row, imageCount: _count.images };
}

shiftExpensesRouter.get("/", requirePermission("SHIFT_EXPENSES"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { search, createdById, type, paid } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  // Chú kiểu tường minh: không có nó, TypeScript nới literal đã lọc của `type` thành `string` rồi
  // Prisma từ chối cả where — mà vì `where` là biến nên phép kiểm thuộc tính thừa không bắt được,
  // client Prisma cũ sẽ cho qua im lặng.
  const where: Prisma.ShiftExpenseWhereInput = {
    spentAt: from || to ? { gte: from, lte: to } : undefined,
    // Giá trị lạ thì bỏ qua bộ lọc thay vì trả lỗi — query string do người dùng gõ tay được.
    type: type === "MATERIAL" || type === "OTHER" ? type : undefined,
    content: search ? { contains: search, mode: "insensitive" } : undefined,
    // "true" = đã chi, "false" = chưa chi, giá trị lạ thì bỏ qua bộ lọc như `type` ở trên.
    // Lọc "chưa chi" thì totalAmount bên dưới thành "tổng còn phải chi" — đúng thứ kế toán cần.
    paidAt: paid === "true" ? { not: null } : paid === "false" ? null : undefined,
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
  // Dấu "đã chi" khoá bản ghi — sửa số tiền sau khi đã chi là làm lệch số đã duyệt chi.
  if (existing.paidAt) throw new HttpError(409, paidLockMessage("sửa"));

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
  if (existing.paidAt) throw new HttpError(409, paidLockMessage("xoá"));

  // Đọc khoá ảnh TRƯỚC khi xoá: cascade dọn sạch dòng trong DB nên xoá xong là không còn gì để đọc,
  // mà cascade lại không đụng tới file trên R2.
  const keys = existing.images.map((image) => image.objectKey);

  await prisma.shiftExpense.delete({ where: { id } });
  await deleteImages(keys);

  res.status(204).end();
});

// Đánh dấu "đã chi". Quyền truyền TƯỜNG MINH "PAY": suy theo method thì POST → ADD, mà vai trò
// "Quán" có sẵn SHIFT_EXPENSES.ADD — bỏ tham số thứ hai là quán tự đánh dấu khoản chi của mình,
// rồi tự khoá mình khỏi sửa. Hai chiều tách thành hai route thay vì một toggle đọc-rồi-ghi: mỗi
// chiều idempotent nên bấm hai lần trên mạng chậm không lật ngược trạng thái.
shiftExpensesRouter.post("/:id/pay", requirePermission("SHIFT_EXPENSES", "PAY"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);

  // updateMany có điều kiện paidAt thay vì update: hai request đồng thời thì đúng một cái ghi được,
  // cái kia count = 0 và nhận 409 thay vì lặng lẽ ghi đè mốc của người trước.
  const { count } = await prisma.shiftExpense.updateMany({
    where: { id, paidAt: null },
    data: { paidAt: new Date(), paidById: req.user?.id },
  });
  if (count === 0) throw new HttpError(409, "Khoản chi này đã được đánh dấu đã chi rồi");

  const item = await prisma.shiftExpense.findUniqueOrThrow({ where: { id }, include: listInclude });
  res.json(toApiRow(item));
});

// Gỡ dấu — cùng quyền PAY. Cũng phải truyền tường minh: DELETE suy ra SHIFT_EXPENSES.DELETE mà vai
// trò "Quán" cũng có sẵn mã đó.
shiftExpensesRouter.delete("/:id/pay", requirePermission("SHIFT_EXPENSES", "PAY"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedExpense(id, req.user);

  const { count } = await prisma.shiftExpense.updateMany({
    where: { id, paidAt: { not: null } },
    data: { paidAt: null, paidById: null },
  });
  if (count === 0) throw new HttpError(409, "Khoản chi này chưa đánh dấu đã chi");

  const item = await prisma.shiftExpense.findUniqueOrThrow({ where: { id }, include: listInclude });
  res.json(toApiRow(item));
});

/** Nạp khoản chi và chặn ngoài phạm vi. Dùng chung cho hai route pay ở trên và ba route ảnh bên dưới. */
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
  const expense = await findOwnedExpense(id, req.user);
  // "Không sửa được nữa" phải bao gồm cả việc thay ảnh hoá đơn sau khi đã chi tiền, không thì dấu
  // chẳng bảo đảm điều gì. Riêng GET ảnh vẫn mở.
  if (expense.paidAt) throw new HttpError(409, paidLockMessage("đổi ảnh chứng từ"));
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
  const expense = await findOwnedExpense(id, req.user);
  if (expense.paidAt) throw new HttpError(409, paidLockMessage("đổi ảnh chứng từ"));

  const image = await prisma.shiftExpenseImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả shiftExpenseId: id ảnh của khoản chi khác thì coi như không tồn tại.
  if (!image || image.shiftExpenseId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.shiftExpenseImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);

  res.status(204).end();
});
