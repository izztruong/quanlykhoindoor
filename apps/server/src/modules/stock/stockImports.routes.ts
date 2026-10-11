import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission, type AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecord, type AffectedCostCheck } from "../../utils/costCheckImpact";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { HttpError } from "../../utils/httpError";
import {
  MAX_IMAGES_PER_IMPORT,
  MAX_IMAGE_BYTES,
  stockImportCreateSchema,
  stockImportImageUploadSchema,
} from "./stockTransaction.schemas";

export const stockImportsRouter = Router();

const detailInclude = {
  warehouse: { include: { shopUser: { select: { id: true, name: true } } } },
  supplier: true,
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true, productGroup: true } } } },
  // Chỉ đếm ảnh, không ký URL — URL chỉ ký ở GET /:id/images khi người dùng mở ảnh.
  _count: { select: { images: true } },
};

/** Phẳng hoá `_count.images` thành `imageCount` để payload không lộ hình dạng truy vấn Prisma. */
function toApiRow<T extends { _count: { images: number } }>(row: T) {
  const { _count, ...rest } = row;
  return { ...rest, imageCount: _count.images };
}

/**
 * NGOẠI LỆ CÓ CHỦ Ý so với `ownerWhere`/`assertOwner` (middleware/auth.ts): phiếu nhập lọc theo
 * CHỦ KHO (`warehouse.shopUserId`), KHÔNG theo `createdById`.
 *
 * Lý do: admin và kế toán gõ hộ quán là chuyện thường, mà lọc theo người tạo thì quán không thấy
 * phiếu của chính kho mình — đúng cái vết đang có ở `otherExpenses` (kế toán ghi hộ thì quán mất
 * dòng đó). Chủ kho mới là thứ trả lời đúng câu "phiếu này của quán nào".
 */
function warehouseScope(user: AuthUser | undefined, requestedWarehouseId?: string) {
  if (user?.scope === "ALL") return requestedWarehouseId ? { id: requestedWarehouseId } : undefined;
  return { shopUserId: user?.id ?? "__none__" };
}

/** Chi tiết/sửa/xoá: ngoài phạm vi trả 404 như không tồn tại, cùng luật `assertOwner`. */
async function findScopedImport(id: string, user: AuthUser | undefined) {
  const item = await prisma.stockImport.findFirst({
    where: { id, warehouse: warehouseScope(user) },
    include: detailInclude,
  });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu nhập kho");
  return item;
}

/**
 * Phiếu nhập là nguồn cột "Nhận trong kỳ" của Check Cost, nên mọi lần ghi phải cảnh báo admin tạo
 * lại phiếu Check Cost bị ảnh hưởng. Khi SỬA phải xét cả mốc CŨ và mốc MỚI: đổi `transactionAt` từ
 * tháng 8 sang tháng 9 là động tới hai kỳ, chỉ xét mốc cũ sẽ bỏ sót phiếu của kỳ mới.
 */
async function affectedCostChecks(shopUserId: string | null, ...moments: (Date | null | undefined)[]) {
  if (!shopUserId) return [] as AffectedCostCheck[];
  const seen = new Set<string>();
  const result: AffectedCostCheck[] = [];
  for (const at of moments) {
    if (!at) continue;
    for (const cc of await findCostChecksUsingPeriodRecord([shopUserId], at)) {
      if (seen.has(cc.id)) continue;
      seen.add(cc.id);
      result.push(cc);
    }
  }
  return result;
}

/** Mọi dòng phải có giá thiết lập cho NCC của phiếu — giữ nguyên chốt đã có từ trước. */
async function assertSupplierPrices(supplierId: string, productIds: string[]) {
  const prices = await prisma.productSupplierPrice.findMany({
    where: { supplierId, productId: { in: productIds } },
    select: { productId: true },
  });
  const priced = new Set(prices.map((p) => p.productId));
  if (productIds.some((id) => !priced.has(id))) {
    throw new HttpError(400, "Có hàng hoá chưa được thiết lập giá cho nhà cung cấp này");
  }
}

stockImportsRouter.get("/", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const { warehouseId, type } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouse: warehouseScope(req.user, warehouseId || undefined),
    type: (type || undefined) as any,
    transactionAt: from || to ? { gte: from, lte: to } : undefined,
  };

  const [rows, total] = await Promise.all([
    prisma.stockImport.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      skip,
      take,
      include: detailInclude,
    }),
    prisma.stockImport.count({ where }),
  ]);

  res.json({ items: rows.map(toApiRow), total, page, pageSize });
});

stockImportsRouter.get("/:id", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  res.json(toApiRow(await findScopedImport(req.params.id as string, req.user)));
});

stockImportsRouter.post("/", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const data = stockImportCreateSchema.parse(req.body);

  // Quán chỉ ghi được vào kho của mình; admin (scope ALL) ghi được mọi kho.
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: data.warehouseId, ...(req.user?.scope === "ALL" ? {} : { shopUserId: req.user?.id ?? "__none__" }) },
    select: { shopUserId: true },
  });
  if (!warehouse) throw new HttpError(404, "Không tìm thấy kho hàng");

  await assertSupplierPrices(
    data.supplierId,
    data.items.map((it) => it.productId),
  );

  const item = await prisma.stockImport.create({
    data: {
      code: generateCode("PN"),
      type: data.type,
      transactionAt: data.transactionAt,
      form: data.form,
      // Luôn COMPLETED: phiếu nháp không được Check Cost tính mà không có dấu hiệu gì (xem schema).
      status: "COMPLETED",
      note: data.note,
      warehouseId: data.warehouseId,
      supplierId: data.supplierId,
      createdById: req.user?.id,
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          costPrice: it.costPrice,
          costAmount: it.quantity * it.costPrice,
          note: it.note,
        })),
      },
    },
    include: detailInclude,
  });

  res.status(201).json({
    ...toApiRow(item),
    affectedCostChecks: await affectedCostChecks(warehouse.shopUserId, data.transactionAt),
  });
});

stockImportsRouter.put("/:id", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await findScopedImport(id, req.user);
  const data = stockImportCreateSchema.parse(req.body);

  // Không cho chuyển phiếu sang kho khác: làm vậy là chuyển hàng của quán này sang Check Cost của
  // quán kia, và phải cảnh báo cả hai bên. Muốn đổi kho thì xoá phiếu rồi gõ lại.
  if (data.warehouseId !== existing.warehouseId) {
    throw new HttpError(400, "Không đổi được kho của phiếu đã lưu — hãy xoá phiếu và tạo lại");
  }

  await assertSupplierPrices(
    data.supplierId,
    data.items.map((it) => it.productId),
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockImportItem.deleteMany({ where: { stockImportId: id } });
    return tx.stockImport.update({
      where: { id },
      data: {
        type: data.type,
        transactionAt: data.transactionAt,
        form: data.form,
        note: data.note,
        supplierId: data.supplierId,
        items: {
          create: data.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            costPrice: it.costPrice,
            costAmount: it.quantity * it.costPrice,
            note: it.note,
          })),
        },
      },
      include: detailInclude,
    });
  });

  res.json({
    ...toApiRow(updated),
    // Cả mốc cũ lẫn mốc mới — xem chú thích affectedCostChecks.
    affectedCostChecks: await affectedCostChecks(
      existing.warehouse.shopUser?.id ?? null,
      existing.transactionAt,
      data.transactionAt,
    ),
  });
});

stockImportsRouter.delete("/:id", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await findScopedImport(id, req.user);

  const affected = await affectedCostChecks(existing.warehouse.shopUser?.id ?? null, existing.transactionAt);

  // Đọc khoá ảnh TRƯỚC khi xoá: cascade dọn dòng DB nhưng không đụng file trên R2.
  const images = await prisma.stockImportImage.findMany({ where: { stockImportId: id }, select: { objectKey: true } });
  await prisma.stockImport.delete({ where: { id } });
  await deleteImages(images.map((image) => image.objectKey));

  // Trả 200 + body chứ không 204: đây là route DELETE duy nhất trong dự án cần trả cảnh báo
  // "tạo lại phiếu Check Cost" cho người dùng.
  res.json({ affectedCostChecks: affected });
});

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh — gọi khi người dùng bấm mở ảnh, không phải mỗi lần tải danh sách.
stockImportsRouter.get("/:id/images", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const id = req.params.id as string;
  await findScopedImport(id, req.user);

  const images = await prisma.stockImportImage.findMany({
    where: { stockImportId: id },
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

// Quyền suy theo method nên POST ảnh = STOCK_IMPORTS.ADD, cố ý: người chỉ có quyền Thêm phải đính
// được ảnh cho phiếu mình vừa tạo. Đòi EDIT ở đây là chặn đứng luồng tạo mới.
stockImportsRouter.post("/:id/images", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }

  const id = req.params.id as string;
  await findScopedImport(id, req.user);
  const { images } = stockImportImageUploadSchema.parse(req.body);

  const existingCount = await prisma.stockImportImage.count({ where: { stockImportId: id } });
  if (existingCount + images.length > MAX_IMAGES_PER_IMPORT) {
    throw new HttpError(
      400,
      `Mỗi phiếu tối đa ${MAX_IMAGES_PER_IMPORT} ảnh (đang có ${existingCount}, chọn thêm ${images.length})`,
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
      const key = `stock-imports/${id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi không ai biết.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.stockImportImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      stockImportId: id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });

  res.status(201).json({ created: uploaded.length });
});

stockImportsRouter.delete("/:id/images/:imageId", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const id = req.params.id as string;
  await findScopedImport(id, req.user);

  const image = await prisma.stockImportImage.findUnique({ where: { id: req.params.imageId as string } });
  // Kiểm cả stockImportId: id ảnh của phiếu khác thì coi như không tồn tại.
  if (!image || image.stockImportId !== id) throw new HttpError(404, "Không tìm thấy ảnh");

  await prisma.stockImportImage.delete({ where: { id: image.id } });
  await deleteImages([image.objectKey]);

  res.status(204).end();
});
