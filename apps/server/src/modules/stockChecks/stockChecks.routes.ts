import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, ownerWhere, requirePermission } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingStockCheck } from "../../utils/costCheckImpact";
import { assertCheckedAtNotInFuture, stampStockCheckLateness } from "../../utils/deadlines";
import { HttpError } from "../../utils/httpError";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { subtractTareWeight } from "../../utils/tareWeight";
import { stockCheckCreateSchema } from "./stockChecks.schemas";

export const stockChecksRouter = Router();

const detailInclude = {
  createdBy: { select: { id: true, name: true } },
  items: { include: { product: { include: { unit: true } } } },
  finishedItems: { include: { finishedGoodItem: { include: { unit: true } } } },
};

stockChecksRouter.get("/", requirePermission("STOCK_CHECKS"), async (req, res) => {
  const { from, to } = parseDateRange(req);
  const { createdById } = req.query as Record<string, string>;
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const where = {
    checkedAt: from || to ? { gte: from, lte: to } : undefined,
    // Phạm vi SELF chỉ thấy phiếu của mình; ALL thấy hết, lọc theo quán qua ?createdById=
    // (dùng cho ô chọn phiếu ở Check Cost).
    createdById: ownerWhere(req.user, createdById),
  };

  const [items, total] = await Promise.all([
    prisma.stockCheck.findMany({
      where,
      orderBy: { checkedAt: "desc" },
      skip,
      take,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.stockCheck.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

stockChecksRouter.get("/:id", requirePermission("STOCK_CHECKS"), async (req, res) => {
  const item = await prisma.stockCheck.findUnique({ where: { id: req.params.id }, include: detailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy phiếu kiểm");
  assertOwner(item, req.user, "Không tìm thấy phiếu kiểm");
  res.json(item);
});

stockChecksRouter.post("/", requirePermission("STOCK_CHECKS"), async (req, res) => {
  const data = stockCheckCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  // Xem chú thích ở createSalesOrder: createdAt ghi tường minh để dấu muộn và mốc hiển thị luôn
  // khớp nhau. Tính hạn trước khi mở transaction cho khỏi kéo dài thời gian giữ transaction.
  const createdAt = new Date();
  assertCheckedAtNotInFuture(data.checkedAt, createdAt);
  const lateness = await stampStockCheckLateness(data.type, data.checkedAt, createdAt);

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.stockCheck.create({
      data: {
        code: generateCode("KT"),
        type: data.type,
        checkedAt: data.checkedAt,
        note: data.note,
        createdById: req.user?.id,
        createdAt,
        dueAt: lateness.dueAt,
        isLate: lateness.isLate,
      },
    });

    if (items.length > 0) {
      await tx.stockCheckItem.createMany({
        data: items.map((it) => ({
          stockCheckId: created.id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          wholePrice: it.wholePrice,
          loosePrice: it.loosePrice,
          note: it.note,
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.stockCheckFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          stockCheckId: created.id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          price: it.price,
          note: it.note,
        })),
      });
    }

    return tx.stockCheck.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
  });

  res.status(201).json(item);
});

// Cần STOCK_CHECKS.EDIT — vai trò "Quán" mặc định không có. Phiếu này vốn là "log bất biến" (xem ghi chú trên model StockCheck),
// cho phép sửa để chữa lỗi nhập liệu, nhưng phiếu Check Cost nào đã dùng phiếu này làm mốc thì
// SỐ LIỆU CỦA PHIẾU ĐÓ KHÔNG TỰ CẬP NHẬT LẠI (Check Cost chốt cứng lúc tạo) — trả về danh sách
// các phiếu Check Cost bị ảnh hưởng để frontend báo cho admin tự tạo lại nếu cần.
stockChecksRouter.put("/:id", requirePermission("STOCK_CHECKS"), async (req, res) => {
  const id = req.params.id as string;
  const data = stockCheckCreateSchema.parse(req.body);
  const items = await subtractTareWeight(data.items);

  const existing = await prisma.stockCheck.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu kiểm");
  assertOwner(existing, req.user, "Không tìm thấy phiếu kiểm");

  // Áp cả ở đường sửa: ngày kiểm ở tương lai là dữ liệu vô nghĩa dù người nhập là admin.
  assertCheckedAtNotInFuture(data.checkedAt);

  const affectedCostChecks = await findCostChecksUsingStockCheck(id);

  // Sửa loại phiếu hoặc ngày kiểm là đổi kỳ, nên hạn phải tính lại theo giá trị mới — để nguyên
  // dấu cũ thì admin chữa nhầm lẫn xong con số vẫn sai. Chỉ an toàn khi quyền sửa không giao cho
  // chính các quán — nếu giao, quán tự sửa phiếu để gỡ chấm đỏ của mình được. `createdAt` giữ nguyên, vì thời điểm
  // nộp thật thì không bao giờ thay đổi.
  const updatedLateness = await stampStockCheckLateness(data.type, data.checkedAt, existing.createdAt);

  const item = await prisma.$transaction(async (tx) => {
    await tx.stockCheckItem.deleteMany({ where: { stockCheckId: id } });
    await tx.stockCheckFinishedItem.deleteMany({ where: { stockCheckId: id } });

    await tx.stockCheck.update({
      where: { id },
      data: { type: data.type, checkedAt: data.checkedAt, note: data.note, dueAt: updatedLateness.dueAt, isLate: updatedLateness.isLate },
    });

    if (items.length > 0) {
      await tx.stockCheckItem.createMany({
        data: items.map((it) => ({
          stockCheckId: id,
          productId: it.productId,
          wholeQuantity: it.wholeQuantity,
          looseQuantity: it.looseQuantity,
          wholePrice: it.wholePrice,
          loosePrice: it.loosePrice,
          note: it.note,
        })),
      });
    }

    if (data.finishedItems.length > 0) {
      await tx.stockCheckFinishedItem.createMany({
        data: data.finishedItems.map((it) => ({
          stockCheckId: id,
          finishedGoodItemId: it.finishedGoodItemId,
          quantity: it.quantity,
          price: it.price,
          note: it.note,
        })),
      });
    }

    return tx.stockCheck.findUniqueOrThrow({ where: { id }, include: detailInclude });
  });

  res.json({ ...item, affectedCostChecks });
});
