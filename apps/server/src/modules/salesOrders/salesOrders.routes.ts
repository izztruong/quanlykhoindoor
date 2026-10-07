import { randomUUID } from "node:crypto";
import { Router } from "express";
import { prisma } from "../../config/db";
import { assertOwner, ownerWhere, requireAnyPermission, requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { deleteImages, isStorageConfigured, putImage, signedImageUrl } from "../../utils/objectStorage";
import { parseDateRange, parsePagination } from "../../utils/pagination";
import { orderNotifications } from "../notifications/notifications.service";
import {
  MAX_IMAGES_PER_ORDER_ITEM,
  MAX_IMAGE_BYTES,
  salesOrderCreateSchema,
  salesOrderItemImageUploadSchema,
  salesOrderProcessSchema,
  salesOrderStatusSchema,
} from "./salesOrders.schemas";
import {
  createSalesOrder,
  processSalesOrder,
  replaceSalesOrderItems,
  salesOrderDetailInclude,
  salesOrderListInclude,
  updateSalesOrderStatus,
  withItemImageCounts,
} from "./salesOrders.service";

export const salesOrdersRouter = Router();

salesOrdersRouter.get("/", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { warehouseId, status, createdById } = req.query as Record<string, string>;
  const { from, to } = parseDateRange(req);
  const { skip, take, page, pageSize } = parsePagination(req, 20);

  const where = {
    warehouseId: warehouseId || undefined,
    status: (status || undefined) as any,
    orderDate: from || to ? { gte: from, lte: to } : undefined,
    // Phạm vi SELF chỉ thấy đơn của mình; ALL thấy hết, lọc theo tài khoản qua ?createdById=.
    createdById: ownerWhere(req.user, createdById),
  };

  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      skip,
      take,
      include: salesOrderListInclude,
    }),
    prisma.salesOrder.count({ where }),
  ]);

  // Cộng số lượng ở server rồi bỏ hẳn mảng dòng hàng khỏi payload: bảng chỉ hiện một con số tổng,
  // gửi kèm từng dòng chỉ để phía web tự cộng là tốn băng thông vô ích.
  const items = rows.map(({ items: lines, ...order }) => ({
    ...order,
    totalQuantity: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
  }));

  res.json({ items, total, page, pageSize });
});

salesOrdersRouter.get("/:id", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const item = await prisma.salesOrder.findUnique({ where: { id: req.params.id }, include: salesOrderDetailInclude });
  if (!item) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(item, req.user, "Không tìm thấy đơn hàng");
  res.json(withItemImageCounts(item));
});

salesOrdersRouter.post("/", requirePermission("ORDERS", "ADD"), async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await createSalesOrder(data, req.user?.id);
  // Gửi sau khi đã ghi xong, không await — lỗi thông báo không được làm hỏng việc tạo đơn.
  if (req.user) orderNotifications.created(item, req.user);
  res.status(201).json(item);
});

salesOrdersRouter.put("/:id", requirePermission("ORDERS", "ADD"), async (req, res) => {
  const data = salesOrderCreateSchema.parse(req.body);
  const item = await replaceSalesOrderItems(req.params.id, data, req.user);
  res.json(item);
});

// Chỉ còn huỷ đơn chưa xử lý: ADD huỷ đơn của mình, APPROVE huỷ mọi đơn (phạm vi kiểm trong service).
salesOrdersRouter.patch("/:id/status", requireAnyPermission("ORDERS.ADD", "ORDERS.APPROVE"), async (req, res) => {
  const { status } = salesOrderStatusSchema.parse(req.body);
  const item = await updateSalesOrderStatus(req.params.id, status, req.user);
  // Đơn đã huỷ không huỷ lại được (409 trong service), nên không có chuyện báo huỷ hai lần.
  if (req.user) orderNotifications.cancelled(item, req.user);
  res.json(item);
});

// Admin xử lý đơn (lần đầu hoặc sửa lại sau khi hoàn thành): NCC, giá, SL + ngày nhận, thêm hàng hoá.
salesOrdersRouter.put("/:id/process", requirePermission("ORDERS", "APPROVE"), async (req, res) => {
  const data = salesOrderProcessSchema.parse(req.body);
  const { order, affectedCostChecks, firstCompletion } = await processSalesOrder(req.params.id, data, req.user);
  // Gửi sau khi đã ghi xong, không await. Chỉ lần đầu hoàn thành — sửa lại không báo quán nữa.
  if (req.user && firstCompletion) orderNotifications.completed(order, req.user);
  res.json({ ...order, affectedCostChecks });
});

// ---- Ảnh chứng từ theo từng dòng hàng — cùng khuôn với ảnh khoản chi (shiftExpenses.routes.ts) ----

/**
 * Nạp đơn + dòng hàng và chặn ngoài phạm vi. Dòng không thuộc đơn này thì coi như không tồn tại —
 * không để ai ghép itemId của đơn khác vào URL của đơn mình được phép xem.
 */
async function findOwnedOrderItem(orderId: string, itemId: string, user: Parameters<typeof assertOwner>[1]) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(order, user, "Không tìm thấy đơn hàng");

  const item = await prisma.salesOrderItem.findUnique({ where: { id: itemId } });
  if (!item || item.salesOrderId !== orderId) throw new HttpError(404, "Không tìm thấy hàng hoá trong đơn");
  return { order, item };
}

/** Chỉ đính/xoá chứng từ khi đơn đã hoàn thành — lúc đó hàng đã về đủ và hoá đơn mới có trong tay. */
function assertCanManageImages(order: { status: string }) {
  if (order.status !== "COMPLETED") {
    throw new HttpError(409, "Chỉ đính được ảnh chứng từ khi đơn đã hoàn thành");
  }
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Chỗ DUY NHẤT ký URL xem ảnh. Không kiểm trạng thái đơn: ảnh đã có thì ai xem được đơn đều xem được.
salesOrdersRouter.get("/:orderId/items/:itemId/images", requirePermission("ORDERS", "VIEW"), async (req, res) => {
  const { item } = await findOwnedOrderItem(req.params.orderId as string, req.params.itemId as string, req.user);

  const images = await prisma.salesOrderItemImage.findMany({
    where: { salesOrderItemId: item.id },
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

salesOrdersRouter.post("/:orderId/items/:itemId/images", requirePermission("ORDERS", "APPROVE"), async (req, res) => {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }

  const { order, item } = await findOwnedOrderItem(req.params.orderId as string, req.params.itemId as string, req.user);
  assertCanManageImages(order);
  const { images } = salesOrderItemImageUploadSchema.parse(req.body);

  const existingCount = await prisma.salesOrderItemImage.count({ where: { salesOrderItemId: item.id } });
  if (existingCount + images.length > MAX_IMAGES_PER_ORDER_ITEM) {
    throw new HttpError(
      400,
      `Mỗi hàng hoá tối đa ${MAX_IMAGES_PER_ORDER_ITEM} ảnh (đang có ${existingCount}, chọn thêm ${images.length})`,
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
      const key = `sales-order-items/${item.id}/${randomUUID()}.${EXTENSION_BY_TYPE[image.contentType]}`;
      await putImage(key, image.buffer, image.contentType);
      uploaded.push(key);
    }
  } catch (error) {
    // Lỗi giữa chừng: dọn những file vừa đẩy lên rồi mới ném, không để lại file mồ côi.
    await deleteImages(uploaded);
    throw error;
  }

  await prisma.salesOrderItemImage.createMany({
    data: uploaded.map((objectKey, index) => ({
      salesOrderItemId: item.id,
      objectKey,
      contentType: decoded[index]!.contentType,
      size: decoded[index]!.buffer.length,
      sortOrder: existingCount + index,
    })),
  });

  res.status(201).json({ created: uploaded.length });
});

salesOrdersRouter.delete(
  "/:orderId/items/:itemId/images/:imageId",
  requirePermission("ORDERS", "APPROVE"),
  async (req, res) => {
    const { order, item } = await findOwnedOrderItem(req.params.orderId as string, req.params.itemId as string, req.user);
    assertCanManageImages(order);

    const image = await prisma.salesOrderItemImage.findUnique({ where: { id: req.params.imageId as string } });
    // Kiểm cả salesOrderItemId: id ảnh của dòng hàng khác thì coi như không tồn tại.
    if (!image || image.salesOrderItemId !== item.id) throw new HttpError(404, "Không tìm thấy ảnh");

    await prisma.salesOrderItemImage.delete({ where: { id: image.id } });
    await deleteImages([image.objectKey]);

    res.status(204).end();
  },
);
