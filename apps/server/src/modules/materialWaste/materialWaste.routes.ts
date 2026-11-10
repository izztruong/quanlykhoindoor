import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, can, ownerWhere, requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecord } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_WASTE,
  materialWasteCreateSchema,
  materialWasteDeductionsSchema,
  materialWasteImageUploadSchema,
} from "./materialWaste.schemas";

export const materialWasteRouter = Router();

// Ô tích "trừ trong Check Cost" chỉ người có DEDUCT mới quyết được. Người khác: dòng mới luôn tích,
// dòng đã có giữ nguyên cờ cũ (PUT xoá hết dòng rồi tạo lại nên phải chép cờ theo hàng hoá).
function resolveDeduct(
  canDeduct: boolean,
  requested: boolean | undefined,
  previous: boolean | undefined,
): boolean {
  if (canDeduct) return requested ?? previous ?? true;
  return previous ?? true;
}

const detailInclude = {
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true, recipeUnit: true } } } },
  finishedItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

materialWasteRouter.get("/", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = {
    wasteAt: from || to ? { gte: from, lte: to } : undefined,
    // Phạm vi SELF chỉ thấy phiếu huỷ của mình; ALL thấy hết.
    createdById: ownerWhere(req.user),
  };

  const [items, total] = await Promise.all([
    prisma.materialWaste.findMany({
      where,
      orderBy: { wasteAt: "desc" },
      skip,
      take,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.materialWaste.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

materialWasteRouter.get("/:id", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const item = await prisma.materialWaste.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(item, req.user, "Không tìm thấy phiếu huỷ");
  res.json(item);
});

materialWasteRouter.post("/", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const data = materialWasteCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);
  const canDeduct = can(req.user, "MATERIAL_WASTE", "DEDUCT");

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.materialWaste.create({
      data: { code: generateCode("PH"), wasteAt: data.wasteAt, note: data.note, createdById: req.user?.id },
    });

    if (items.length > 0) {
      await tx.materialWasteItem.createMany({
        data: items.map((it) => ({
          materialWasteId: created.id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          note: it.note,
          deductInCostCheck: resolveDeduct(canDeduct, it.deductInCostCheck, undefined),
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.materialWasteFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          materialWasteId: created.id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
          deductInCostCheck: resolveDeduct(canDeduct, it.deductInCostCheck, undefined),
        })),
      });
    }

    return tx.materialWaste.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  res.status(201).json(item);
});

// Cần MATERIAL_WASTE.EDIT — vai trò "Quán" mặc định không có. Phiếu huỷ không liên kết trực tiếp tới Check Cost (được gộp theo kỳ lúc
// tính), nên tìm phiếu Check Cost bị ảnh hưởng dựa trên quán + thời điểm huỷ TRƯỚC khi sửa —
// số liệu các phiếu đó không tự cập nhật lại, trả về danh sách để frontend báo cho admin.
materialWasteRouter.put("/:id", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const id = req.params.id as string;
  const data = materialWasteCreateSchema.parse(req.body);
  // KHÔNG trừ vỏ ở PUT — xem `subtractTareWeight`: form sửa nạp lượng TỊNH đã lưu.
  const items = data.items;

  const existing = await prisma.materialWaste.findUnique({
    where: { id },
    include: {
      items: { select: { productId: true, deductInCostCheck: true } },
      finishedItems: { select: { finishedGoodItemId: true, deductInCostCheck: true } },
    },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(existing, req.user, "Không tìm thấy phiếu huỷ");

  const canDeduct = can(req.user, "MATERIAL_WASTE", "DEDUCT");
  const prevItemDeduct = new Map(existing.items.map((it) => [it.productId, it.deductInCostCheck]));
  const prevFinishedDeduct = new Map(existing.finishedItems.map((it) => [it.finishedGoodItemId, it.deductInCostCheck]));

  const affectedCostChecks = await findCostChecksUsingPeriodRecord([existing.createdById], existing.wasteAt);

  const item = await prisma.$transaction(async (tx) => {
    await tx.materialWasteItem.deleteMany({ where: { materialWasteId: id } });
    await tx.materialWasteFinishedItem.deleteMany({ where: { materialWasteId: id } });

    await tx.materialWaste.update({ where: { id }, data: { wasteAt: data.wasteAt, note: data.note } });

    if (items.length > 0) {
      await tx.materialWasteItem.createMany({
        data: items.map((it) => ({
          materialWasteId: id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          note: it.note,
          deductInCostCheck: resolveDeduct(canDeduct, it.deductInCostCheck, prevItemDeduct.get(it.productId)),
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.materialWasteFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          materialWasteId: id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          note: it.note,
          deductInCostCheck: resolveDeduct(
            canDeduct,
            it.deductInCostCheck,
            prevFinishedDeduct.get(it.finishedGoodItemId),
          ),
        })),
      });
    }

    return tx.materialWaste.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});

// Chỉ đổi ô tích "trừ trong Check Cost" — route riêng vì người duyệt (kế toán) thường không có quyền
// sửa phiếu. Quyền truyền TƯỜNG MINH: suy theo method thì PATCH → EDIT. Id dòng không thuộc phiếu này
// bị bỏ qua (lọc theo materialWasteId), không cho đổi chéo sang phiếu khác.
materialWasteRouter.patch("/:id/deductions", requirePermission("MATERIAL_WASTE", "DEDUCT"), async (req, res) => {
  const id = req.params.id as string;
  const data = materialWasteDeductionsSchema.parse(req.body);

  const existing = await prisma.materialWaste.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(existing, req.user, "Không tìm thấy phiếu huỷ");

  const affectedCostChecks = await findCostChecksUsingPeriodRecord([existing.createdById], existing.wasteAt);

  const item = await prisma.$transaction(async (tx) => {
    // Gom theo giá trị (tích / bỏ tích) để mỗi bảng tối đa 2 lệnh — Neon chậm, đừng update từng dòng.
    for (const value of [true, false]) {
      const itemIds = data.items.filter((it) => it.deductInCostCheck === value).map((it) => it.id);
      const finishedIds = data.finishedItems.filter((it) => it.deductInCostCheck === value).map((it) => it.id);
      if (itemIds.length > 0) {
        await tx.materialWasteItem.updateMany({
          where: { id: { in: itemIds }, materialWasteId: id },
          data: { deductInCostCheck: value },
        });
      }
      if (finishedIds.length > 0) {
        await tx.materialWasteFinishedItem.updateMany({
          where: { id: { in: finishedIds }, materialWasteId: id },
          data: { deductInCostCheck: value },
        });
      }
    }
    return tx.materialWaste.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});

// ---- Ảnh chứng minh hàng huỷ — cùng khuôn với ảnh khoản chi ngoài (otherExpenses.routes.ts) ----

/** Nạp phiếu và chặn ngoài phạm vi (404), y như GET /:id. */
async function findOwnedWaste(id: string, user: Parameters<typeof assertOwner>[1]) {
  const waste = await prisma.materialWaste.findUnique({ where: { id } });
  if (!waste) throw new HttpError(404, "Không tìm thấy phiếu huỷ");
  assertOwner(waste, user, "Không tìm thấy phiếu huỷ");
  return waste;
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh — gọi khi mở chi tiết/sửa phiếu, không phải mỗi lần tải danh sách.
materialWasteRouter.get("/:id/images", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedWaste(id, req.user);

  const images = await prisma.materialWasteImage.findMany({
    where: { materialWasteId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  res.json(
    await Promise.all(
      images.map(async (image) => ({
        id: image.id,
        contentType: image.contentType,
        size: image.size,
        url: await signedImageUrl(image.objectKey),
      })),
    ),
  );
});

// Quyền suy theo method nên POST ảnh = MATERIAL_WASTE.ADD, cố ý: quán chỉ có quyền Thêm phải đính được
// ảnh cho phiếu mình vừa tạo (ảnh gửi SAU khi phiếu đã có id). Đòi EDIT là chặn đứng luồng tạo mới.
materialWasteRouter.post("/:id/images", requirePermission("MATERIAL_WASTE"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }

  const id = req.params.id as string;
  await findOwnedWaste(id, req.user);
  const { images } = materialWasteImageUploadSchema.parse(req.body);

  const existingCount = await prisma.materialWasteImage.count({ where: { materialWasteId: id } });
  if (existingCount + images.length > MAX_IMAGES_PER_WASTE) {
    throw new HttpError(
      400,
      `Mỗi phiếu huỷ tối đa ${MAX_IMAGES_PER_WASTE} ảnh (đang có ${existingCount}, chọn thêm ${images.length})`,
    );
  }

  // Giải base64 và kiểm kích thước THẬT (chuỗi base64 dài hơn dữ liệu gốc ~33%), kiểm hết mọi ảnh
  // trước khi đẩy ảnh đầu tiên lên để file lỗi không kịp sinh rác.
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
      const key = `material-waste/${id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.materialWasteImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      materialWasteId: id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });

  res.status(201).json({ created: uploaded.length });
});

// Quyền truyền TƯỜNG MINH "EDIT": suy theo method thì DELETE → MATERIAL_WASTE.DELETE, tức quyền xoá cả
// phiếu — gỡ một tấm ảnh chỉ là sửa phiếu. Ảnh mới chọn mà chưa lưu thì bỏ ở phía client, không cần quyền.
materialWasteRouter.delete("/:id/images/:imageId", requirePermission("MATERIAL_WASTE", "EDIT"), async (req, res) => {
  const id = req.params.id as string;
  await findOwnedWaste(id, req.user);

  const image = await prisma.materialWasteImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả materialWasteId: id ảnh của phiếu khác thì coi như không tồn tại.
  if (!image || image.materialWasteId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.materialWasteImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);

  res.status(204).end();
});
