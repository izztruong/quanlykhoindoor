import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecord, findCostChecksUsingPeriodRecords } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import { materialTransferBulkSchema, materialTransferCreateSchema } from "./materialTransfers.schemas";

// Không có bước quán nhận xác nhận; người có MATERIAL_TRANSFERS.* thao tác trên mọi quán.
export const materialTransfersRouter = Router();

const listInclude = {
  _count: { select: { items: true } },
  fromUser: { select: { id: true, name: true } },
  toUser: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

const detailInclude = {
  ...listInclude,
  items: { include: { product: { include: { unit: true, recipeUnit: true } }, supplier: true } },
};

materialTransfersRouter.get("/", requirePermission("MATERIAL_TRANSFERS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = { transferAt: from || to ? { gte: from, lte: to } : undefined };

  const [items, total] = await Promise.all([
    prisma.materialTransfer.findMany({ where, orderBy: { transferAt: "desc" }, skip, take, include: listInclude }),
    prisma.materialTransfer.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

materialTransfersRouter.get("/:id", requirePermission("MATERIAL_TRANSFERS"), async (req, res) => {
  const item = await prisma.materialTransfer.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu điều chuyển");
  res.json(item);
});

materialTransfersRouter.post("/", requirePermission("MATERIAL_TRANSFERS"), async (req, res) => {
  const data = materialTransferCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.materialTransfer.create({
      data: {
        code: generateCode("DC"),
        fromUserId: data.fromUserId,
        toUserId: data.toUserId,
        transferAt: data.transferAt,
        note: data.note,
        createdById: req.user?.id,
      },
    });

    await tx.materialTransferItem.createMany({
      data: items.map((it) => ({
        materialTransferId: created.id,
        productId: it.productId,
        wholeQuantity: it.wholeQuantity,
        looseQuantity: it.looseQuantity,
        supplierId: it.supplierId,
        costPrice: it.costPrice,
        note: it.note,
      })),
    });

    return tx.materialTransfer.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  // Phiếu điều chuyển động tới Check Cost của CẢ HAI quán. Trước đây chỉ `PUT` cảnh báo, nên tạo
  // phiếu bằng form thì không ai biết phải tạo lại phiếu Check Cost nào.
  const affectedCostChecks = await findCostChecksUsingPeriodRecords([
    { shopUserId: data.fromUserId, at: data.transferAt },
    { shopUserId: data.toUserId, at: data.transferAt },
  ]);

  res.status(201).json({ ...item, affectedCostChecks });
});

/**
 * Nhập nhiều phiếu điều chuyển từ một file Excel.
 *
 * Quyền chỉ cần **ADD** (suy từ method): route này chỉ TẠO, không ghi đè.
 *
 * Gộp mọi phép kiểm thành một query mỗi loại thay vì lặp `POST /` N lần. Vẫn giữ đủ chốt của `POST /`,
 * đặc biệt là `subtractTareWeight` — bỏ sót là hai đường ghi cho hai kết quả khác nhau.
 */
materialTransfersRouter.post("/bulk-import", requirePermission("MATERIAL_TRANSFERS"), async (req, res) => {
  const { items: transfers, confirmDuplicates } = materialTransferBulkSchema.parse(req.body);

  // 1. Kiểm quán — một query cho cả file. `POST /` chỉ dựa vào khoá ngoại, nhưng với một lô thì FK nổ
  //    là rollback cả lô kèm câu lỗi vô dụng, nên ở đây kiểm trước và nêu rõ id nào sai.
  const shopIds = [...new Set(transfers.flatMap((t) => [t.fromUserId, t.toUserId]))];
  const shops = await prisma.user.findMany({
    where: { id: { in: shopIds }, role: { isShop: true } },
    select: { id: true, name: true },
  });
  const shopById = new Map(shops.map((s) => [s.id, s]));
  const badShops = shopIds.filter((id) => !shopById.has(id));
  if (badShops.length > 0) {
    // Nêu TÊN chứ không chỉ số lượng — id trong câu lỗi thì người dùng không tra được là tài khoản nào.
    // Thêm một query, nhưng chỉ chạy trên nhánh lỗi.
    const found = await prisma.user.findMany({ where: { id: { in: badShops } }, select: { id: true, name: true } });
    const nameById = new Map(found.map((u) => [u.id, u.name]));
    const shown = badShops.map((id) => {
      const name = nameById.get(id);
      return name ? `"${name}" (không thuộc vai trò "Là quán")` : `"${id}" (không tồn tại)`;
    });
    throw new HttpError(
      400,
      `Tài khoản quán không dùng được: ${shown.slice(0, 10).join("; ")}${shown.length > 10 ? ` và ${shown.length - 10} tài khoản nữa` : ""}.`,
    );
  }

  // 2. Dòng có NCC mà để trống giá vốn thì lấy GIÁ XUẤT của NCC đó — giống form điều chuyển (khác
  //    phiếu nhập kho lấy giá nhập). NCC ở đây tuỳ chọn nên chỉ kiểm những dòng thật sự cần.
  const needPrice = transfers.flatMap((t) =>
    t.items.filter((it) => it.supplierId && it.costPrice == null).map((it) => ({ supplierId: it.supplierId!, productId: it.productId })),
  );
  const exportPriceByPair = new Map<string, number>();
  if (needPrice.length > 0) {
    const prices = await prisma.productSupplierPrice.findMany({
      where: {
        supplierId: { in: [...new Set(needPrice.map((p) => p.supplierId))] },
        productId: { in: [...new Set(needPrice.map((p) => p.productId))] },
      },
      select: { supplierId: true, productId: true, exportPrice: true },
    });
    for (const p of prices) exportPriceByPair.set(`${p.supplierId}|${p.productId}`, Number(p.exportPrice));

    const missing = needPrice.filter((p) => !exportPriceByPair.has(`${p.supplierId}|${p.productId}`));
    if (missing.length > 0) {
      const [products, suppliers] = await Promise.all([
        prisma.product.findMany({ where: { id: { in: [...new Set(missing.map((m) => m.productId))] } }, select: { id: true, name: true } }),
        prisma.supplier.findMany({ where: { id: { in: [...new Set(missing.map((m) => m.supplierId))] } }, select: { id: true, name: true } }),
      ]);
      const productName = new Map(products.map((p) => [p.id, p.name]));
      const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
      const shown = [
        ...new Set(missing.map((m) => `"${productName.get(m.productId) ?? m.productId}" với NCC "${supplierName.get(m.supplierId) ?? m.supplierId}"`)),
      ];
      throw new HttpError(
        400,
        `Chưa thiết lập giá xuất cho: ${shown.slice(0, 10).join("; ")}${shown.length > 10 ? ` và ${shown.length - 10} cặp nữa` : ""}.`,
      );
    }
  }

  // 3. Trừ vỏ MỘT LƯỢT cho cả file: hàm nhận mảng và chỉ chạy một query. Phải gọi dù file Excel chưa
  //    có cột SL lẻ — CLAUDE.md đặt nó thành luật cho cả ba module, và đường form đang gọi ở cả POST
  //    lẫn PUT; bỏ sót ở đây là hai đường ghi cho hai kết quả khác nhau khi về sau có SL lẻ.
  const flatLines = transfers.flatMap((t, index) => t.items.map((it) => ({ ...it, _transfer: index })));
  const adjusted = await subtractTareWeight(flatLines);
  const linesByTransfer = new Map<number, typeof adjusted>();
  for (const line of adjusted) {
    const list = linesByTransfer.get(line._transfer) ?? [];
    list.push(line);
    linesByTransfer.set(line._transfer, list);
  }

  // 4. Kiểm phiếu trùng — một query. Trả 200 kèm danh sách thay vì 400: `HttpError` chỉ chở được một
  //    câu, và web không đọc `ZodError.issues` (khuôn `posSales` và phiếu nhập kho).
  const existing = await prisma.materialTransfer.findMany({
    where: { OR: transfers.map((t) => ({ fromUserId: t.fromUserId, toUserId: t.toUserId, transferAt: t.transferAt })) },
    select: { code: true, transferAt: true, fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
  });
  if (existing.length > 0 && !confirmDuplicates) {
    res.json({
      created: 0,
      codes: [],
      affectedCostChecks: [],
      duplicates: existing.map((row) => ({
        code: row.code,
        fromName: row.fromUser.name,
        toName: row.toUser.name,
        transferAt: row.transferAt,
      })),
    });
    return;
  }

  // 5. Sinh mã trước rồi kiểm trùng một lượt — `generateCode` dựa `Date.now() % 100000` cộng một
  //    counter TRONG PROCESS, nên để P2002 nổ là rollback cả lô.
  const codes: string[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    while (codes.length < transfers.length) codes.push(generateCode("DC"));
    const taken = await prisma.materialTransfer.findMany({ where: { code: { in: codes } }, select: { code: true } });
    if (taken.length === 0) break;
    const takenSet = new Set(taken.map((row) => row.code));
    for (let i = codes.length - 1; i >= 0; i--) if (takenSet.has(codes[i]!)) codes.splice(i, 1);
  }
  if (codes.length < transfers.length) throw new HttpError(409, "Không sinh được mã phiếu duy nhất, vui lòng thử lại.");

  // 6. Ghi: 3 statement bất kể N. `createMany` không nhận nested create nên pre-generate mã rồi đọc
  //    lại id theo mã. timeout 30s là chuẩn repo cho nhập từ file (POST / hiện không có timeout).
  await prisma.$transaction(
    async (tx) => {
      await tx.materialTransfer.createMany({
        data: transfers.map((t, index) => ({
          code: codes[index]!,
          fromUserId: t.fromUserId,
          toUserId: t.toUserId,
          transferAt: t.transferAt,
          note: t.note,
          createdById: req.user?.id,
        })),
      });

      const created = await tx.materialTransfer.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } });
      const idByCode = new Map(created.map((row) => [row.code, row.id]));

      await tx.materialTransferItem.createMany({
        data: transfers.flatMap((_t, index) =>
          (linesByTransfer.get(index) ?? []).map((it) => ({
            materialTransferId: idByCode.get(codes[index]!)!,
            productId: it.productId,
            wholeQuantity: it.wholeQuantity,
            looseQuantity: it.looseQuantity,
            supplierId: it.supplierId,
            costPrice: it.costPrice ?? (it.supplierId ? exportPriceByPair.get(`${it.supplierId}|${it.productId}`) : undefined),
            note: it.note,
          })),
        ),
      });
    },
    { timeout: 30000 },
  );

  // 7. Cảnh báo Check Cost — một query cho cả lô, HAI cặp mỗi phiếu (quán gửi và quán nhận).
  const affected = await findCostChecksUsingPeriodRecords(
    transfers.flatMap((t) => [
      { shopUserId: t.fromUserId, at: t.transferAt },
      { shopUserId: t.toUserId, at: t.transferAt },
    ]),
  );

  res.status(201).json({ created: transfers.length, codes, affectedCostChecks: affected, duplicates: [] });
});

// Cần MATERIAL_TRANSFERS.EDIT. Phiếu điều chuyển không liên kết trực tiếp tới
// Check Cost — tìm phiếu bị ảnh hưởng dựa trên CẢ quán gửi lẫn quán nhận (mỗi bên đều có thể đã
// dùng phiếu này khi tính Check Cost của họ) + thời điểm điều chuyển TRƯỚC khi sửa.
materialTransfersRouter.put("/:id", requirePermission("MATERIAL_TRANSFERS"), async (req, res) => {
  const id = req.params.id as string;
  const data = materialTransferCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const existing = await prisma.materialTransfer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu điều chuyển");

  const affectedCostChecks = await findCostChecksUsingPeriodRecord([existing.fromUserId, existing.toUserId], existing.transferAt);

  const item = await prisma.$transaction(async (tx) => {
    await tx.materialTransferItem.deleteMany({ where: { materialTransferId: id } });

    await tx.materialTransfer.update({
      where: { id },
      data: { fromUserId: data.fromUserId, toUserId: data.toUserId, transferAt: data.transferAt, note: data.note },
    });

    await tx.materialTransferItem.createMany({
      data: items.map((it) => ({
        materialTransferId: id,
        productId: it.productId,
        wholeQuantity: it.wholeQuantity,
        looseQuantity: it.looseQuantity,
        supplierId: it.supplierId,
        costPrice: it.costPrice,
        note: it.note,
      })),
    });

    return tx.materialTransfer.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});
