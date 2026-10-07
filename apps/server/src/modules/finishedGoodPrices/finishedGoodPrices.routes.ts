import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { findCostChecksUsingEffectiveDate } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { finishedGoodItemBulkSchema, finishedGoodItemSchema, priceMilestoneSchema } from "./finishedGoodPrices.schemas";
import { parseDateOnly, recordPriceChange, samePrice, todayDateKey } from "./finishedGoodPrices.service";

/**
 * Lịch sử giá bán đồ thành phẩm/món.
 *
 * Doanh thu Check Cost = SL bán từng ô giờ POS × giá CÓ HIỆU LỰC tại mốc đó, nên đổi giá bán giữa kỳ
 * không còn làm lệch doanh thu cả kỳ — và doanh thu là mẫu số của mọi tỷ lệ % trong Check Cost.
 *
 * `FinishedGoodItem.sellingPrice` được giữ lại làm bản sao giá hiện hành (nó còn là giá mặc định của
 * phiếu kiểm kê quán). Cột đó có BA đường ghi: trang này, modal danh mục (`PUT /finished-good-items/:id`)
 * và nhập Excel (`POST /finished-good-items/bulk-import`). Hai đường sau vốn do `crudFactory` sinh ra
 * và ghi thẳng cột, nên `finishedGoodItemPriceSyncRouter` dưới đây TIẾP QUẢN hẳn chúng — không chèn
 * giữa rồi `next()`, vì chỉ khi tự xử lý trọn gói thì mốc giá và cột mirror mới nằm trong cùng một
 * transaction. Thiếu điều đó là có lúc Check Cost tính một giá còn danh mục hiện giá khác.
 */

export const finishedGoodPricesRouter = Router();

/** Các mốc giá của một món, mới nhất trước. */
finishedGoodPricesRouter.get("/:finishedGoodItemId", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const items = await prisma.finishedGoodPrice.findMany({
    where: { finishedGoodItemId: req.params.finishedGoodItemId },
    orderBy: { effectiveFrom: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  res.json({ items });
});

/**
 * Thêm hoặc sửa một mốc giá. Khác hai đường ghi kia: ở đây người dùng tự khai NGÀY HIỆU LỰC, nên khai
 * muộn được ("thực ra đổi giá từ ngày 10").
 *
 * Mirror chỉ cập nhật khi mốc này là mốc mới nhất không thuộc tương lai — thêm một mốc quá khứ thì giá
 * hiện hành không được phép nhảy về giá cũ.
 */
finishedGoodPricesRouter.put("/:finishedGoodItemId", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const { finishedGoodItemId } = req.params;
  const data = priceMilestoneSchema.parse(req.body);

  const item = await prisma.finishedGoodItem.findUnique({ where: { id: finishedGoodItemId }, select: { id: true } });
  if (!item) throw new HttpError(404, "Không tìm thấy đồ thành phẩm");

  const effectiveFrom = parseDateOnly(data.effectiveFrom);
  const todayKey = todayDateKey();

  await prisma.$transaction(async (tx) => {
    await tx.finishedGoodPrice.upsert({
      where: { finishedGoodItemId_effectiveFrom: { finishedGoodItemId, effectiveFrom } },
      create: { finishedGoodItemId, effectiveFrom, sellingPrice: data.sellingPrice, createdById: req.user?.id },
      update: { sellingPrice: data.sellingPrice, createdById: req.user?.id },
    });

    const current = await tx.finishedGoodPrice.findFirst({
      where: { finishedGoodItemId, effectiveFrom: { lte: parseDateOnly(todayKey) } },
      orderBy: { effectiveFrom: "desc" },
      select: { sellingPrice: true },
    });
    if (current) {
      await tx.finishedGoodItem.update({ where: { id: finishedGoodItemId }, data: { sellingPrice: current.sellingPrice } });
    }
  });

  const [items, affectedCostChecks] = await Promise.all([
    prisma.finishedGoodPrice.findMany({
      where: { finishedGoodItemId },
      orderBy: { effectiveFrom: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    findCostChecksUsingEffectiveDate(effectiveFrom),
  ]);
  res.json({ items, affectedCostChecks });
});

finishedGoodPricesRouter.delete(
  "/:finishedGoodItemId/:priceId",
  requirePermission("FINISHED_GOODS", "DELETE"),
  async (req, res) => {
    const { finishedGoodItemId, priceId } = req.params;
    const price = await prisma.finishedGoodPrice.findUnique({
      where: { id: priceId },
      select: { finishedGoodItemId: true, effectiveFrom: true },
    });
    if (!price || price.finishedGoodItemId !== finishedGoodItemId) throw new HttpError(404, "Không tìm thấy mốc giá");

    const affectedCostChecks = await findCostChecksUsingEffectiveDate(price.effectiveFrom);
    await prisma.finishedGoodPrice.delete({ where: { id: priceId } });
    res.json({ affectedCostChecks });
  },
);

// ---------------------------------------------------------------------------
// Hai đường ghi đồ thành phẩm được tiếp quản để giữ lịch sử giá đồng bộ.
// Mount TRƯỚC finishedGoodItemsRouter trên cùng path /api/finished-good-items.
// Các route còn lại (GET list, GET :id, POST, DELETE) vẫn do crudFactory lo.
// ---------------------------------------------------------------------------
export const finishedGoodItemPriceSyncRouter = Router();

finishedGoodItemPriceSyncRouter.put("/:id", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const data = finishedGoodItemSchema.partial().parse(req.body);

  const existing = await prisma.finishedGoodItem.findUnique({
    where: { id: req.params.id },
    select: { id: true, sellingPrice: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy bản ghi");

  const item = await prisma.$transaction(async (tx) => {
    await recordPriceChange(tx, existing.id, existing.sellingPrice, data.sellingPrice, req.user?.id);
    return tx.finishedGoodItem.update({ where: { id: existing.id }, data, include: { unit: true } });
  });

  res.json(item);
});

finishedGoodItemPriceSyncRouter.post(
  "/bulk-import",
  requirePermission("FINISHED_GOODS", "ADD"),
  requirePermission("FINISHED_GOODS", "EDIT"),
  async (req, res) => {
    const { items } = finishedGoodItemBulkSchema.parse(req.body);

    // Trùng mã trong cùng file thì dòng cuối thắng — y như crudFactory.
    const deduped = [...new Map(items.map((it) => [it.code, it])).values()];
    const existing = await prisma.finishedGoodItem.findMany({
      where: { code: { in: deduped.map((it) => it.code) } },
      select: { id: true, code: true, sellingPrice: true },
    });
    const existingByCode = new Map(existing.map((row) => [row.code, row]));

    const toCreate = deduped.filter((it) => !existingByCode.has(it.code));
    const toUpdate = deduped.filter((it) => existingByCode.has(it.code));

    await prisma.$transaction(
      async (tx) => {
        if (toCreate.length > 0) await tx.finishedGoodItem.createMany({ data: toCreate });

        // Món mới: giá trong file là mốc giá ĐẦU TIÊN nên áp cho cả quá khứ, cùng lý do như phiên bản
        // công thức đầu tiên — nếu đóng mốc hôm nay thì phiếu Check Cost kỳ trước ra doanh thu 0.
        const created = await tx.finishedGoodItem.findMany({
          where: { code: { in: toCreate.map((it) => it.code) } },
          select: { id: true, code: true },
        });
        const createdByCode = new Map(created.map((row) => [row.code, row.id]));
        for (const it of toCreate) {
          if (it.sellingPrice === undefined) continue;
          const id = createdByCode.get(it.code);
          if (!id) continue;
          await tx.finishedGoodPrice.create({
            data: {
              finishedGoodItemId: id,
              effectiveFrom: parseDateOnly("2000-01-01"),
              sellingPrice: it.sellingPrice,
              createdById: req.user?.id,
            },
          });
        }

        for (const it of toUpdate) {
          const row = existingByCode.get(it.code)!;
          // Chỉ sinh mốc khi giá đổi THẬT: bulk-import gửi trọn dòng nên nhập lại file cũ sẽ "set" lại
          // giá cho cả mấy trăm món, không lọc thì mỗi lần nhập là mấy trăm mốc giá rác.
          await recordPriceChange(tx, row.id, row.sellingPrice, it.sellingPrice, req.user?.id);
          await tx.finishedGoodItem.update({ where: { code: it.code }, data: it });
        }
      },
      { timeout: 30000 },
    );

    const pricesRecorded = toUpdate.filter((it) => !samePrice(existingByCode.get(it.code)!.sellingPrice, it.sellingPrice)).length;
    res.json({ created: toCreate.length, updated: toUpdate.length, pricesRecorded });
  },
);
