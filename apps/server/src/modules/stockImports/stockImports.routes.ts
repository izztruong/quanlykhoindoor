import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission, type AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecords, type AffectedCostCheck } from "../../utils/costCheckImpact";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { HttpError } from "../../utils/httpError";
import {
  MAX_IMAGES_PER_IMPORT,
  MAX_IMAGE_BYTES,
  stockImportBulkSchema,
  stockImportCreateSchema,
  stockImportImageUploadSchema,
} from "./stockImports.schemas";

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
  return findCostChecksUsingPeriodRecords(moments.filter((at): at is Date => Boolean(at)).map((at) => ({ shopUserId, at })));
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

/**
 * Nhập nhiều phiếu từ một file Excel.
 *
 * Quyền chỉ cần **ADD** (suy từ method): route này chỉ TẠO, không upsert. `crudFactory` xếp chồng
 * ADD+EDIT vì nó ghi đè theo `code`; tiền lệ cho "thêm mới thuần" là `otherExpenses`/`shiftExpenses`.
 *
 * Gộp mọi phép kiểm thành một query mỗi loại thay vì lặp `POST /` N lần (N phiếu × 4 query ≈ 800
 * round-trip Neon cho một file 200 phiếu). Vẫn giữ đủ 4 chốt của `POST /`: kho thuộc quán, giá NCC,
 * `status: "COMPLETED"`, `costAmount = SL × giá`.
 */
stockImportsRouter.post("/bulk-import", requirePermission("STOCK_IMPORTS"), async (req, res) => {
  const { items, confirmDuplicates } = stockImportBulkSchema.parse(req.body);

  // 1. Kiểm kho — một query cho cả file. Quán chỉ ghi được vào kho của mình.
  const warehouseIds = [...new Set(items.map((it) => it.warehouseId))];
  const warehouses = await prisma.warehouse.findMany({
    where: { id: { in: warehouseIds }, ...(req.user?.scope === "ALL" ? {} : { shopUserId: req.user?.id ?? "__none__" }) },
    select: { id: true, code: true, shopUserId: true },
  });
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const badWarehouses = warehouseIds.filter((id) => !warehouseById.has(id));
  if (badWarehouses.length > 0) {
    throw new HttpError(400, `Có ${badWarehouses.length} kho không tồn tại hoặc không thuộc quán của bạn.`);
  }

  // 2. Kiểm phiếu trùng — một query. Nhập lại chính file vừa xuất ra sẽ sinh phiếu trùng, nên cảnh
  //    báo trước; người dùng xác nhận thì mới ghi. Trả 200 kèm danh sách thay vì 400: `HttpError`
  //    chỉ chở được một câu, và web không đọc `ZodError.issues` (khuôn `posSales` cũng trả 200).
  const existing = await prisma.stockImport.findMany({
    where: {
      OR: items.map((it) => ({
        warehouseId: it.warehouseId,
        supplierId: it.supplierId,
        transactionAt: it.transactionAt,
      })),
    },
    select: { code: true, warehouseId: true, supplierId: true, transactionAt: true, supplier: { select: { name: true } } },
  });
  if (existing.length > 0 && !confirmDuplicates) {
    const duplicates = existing.map((row) => ({
      code: row.code,
      warehouseCode: warehouseById.get(row.warehouseId)?.code ?? row.warehouseId,
      supplierName: row.supplier?.name ?? null,
      transactionAt: row.transactionAt,
    }));
    res.json({ created: 0, codes: [], affectedCostChecks: [], duplicates });
    return;
  }

  // 3. Sinh mã trước rồi kiểm trùng một lượt. `generateCode` dựa `Date.now() % 100000` cộng một
  //    counter TRONG PROCESS, nên hai instance hoặc một lần restart vẫn có thể cho mã trùng — để
  //    P2002 nổ là rollback cả lô, và người dùng chỉ thấy "Dữ liệu đã tồn tại (trùng code)".
  const codes: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    while (codes.length < items.length) codes.push(generateCode("PN"));
    const taken = await prisma.stockImport.findMany({ where: { code: { in: codes } }, select: { code: true } });
    if (taken.length === 0) break;
    const takenSet = new Set(taken.map((row) => row.code));
    for (let i = codes.length - 1; i >= 0; i--) if (takenSet.has(codes[i]!)) codes.splice(i, 1);
  }
  if (codes.length < items.length) throw new HttpError(409, "Không sinh được mã phiếu duy nhất, vui lòng thử lại.");

  // 4. Ghi: 3 statement bất kể N. `createMany` KHÔNG nhận nested create nên phải pre-generate mã rồi
  //    đọc lại id theo mã — khuôn của `finishedGoodPrices.routes.ts`.
  //    timeout 30s là chuẩn repo cho nhập từ file; quá hạn thì Postgres trả 57014 và middleware map 504.
  await prisma.$transaction(
    async (tx) => {
      await tx.stockImport.createMany({
        data: items.map((it, index) => ({
          code: codes[index]!,
          type: it.type,
          transactionAt: it.transactionAt,
          form: it.form,
          status: "COMPLETED" as const,
          note: it.note,
          warehouseId: it.warehouseId,
          supplierId: it.supplierId,
          createdById: req.user?.id,
        })),
      });

      const created = await tx.stockImport.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
      const idByCode = new Map(created.map((row) => [row.code, row.id]));

      await tx.stockImportItem.createMany({
        data: items.flatMap((it, index) =>
          it.items.map((line) => ({
            stockImportId: idByCode.get(codes[index]!)!,
            productId: line.productId,
            quantity: line.quantity,
            costPrice: line.costPrice,
            costAmount: line.quantity * line.costPrice,
            note: line.note,
          })),
        ),
      });
    },
    { timeout: 30000 },
  );

  // 5. Cảnh báo Check Cost — một query cho cả lô (xem findCostChecksUsingPeriodRecords).
  const affected = await findCostChecksUsingPeriodRecords(
    items.map((it) => ({ shopUserId: warehouseById.get(it.warehouseId)?.shopUserId ?? null, at: it.transactionAt })),
  );

  res.status(201).json({ created: items.length, codes, affectedCostChecks: affected, duplicates: [] });
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
