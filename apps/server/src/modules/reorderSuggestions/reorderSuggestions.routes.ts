import { type Request, Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { getEstimatedOnHand } from "../../utils/estimatedStock";
import { parsePagination } from "../../utils/pagination";
import { createSalesOrder } from "../salesOrders/salesOrders.service";
import { reorderCommitSchema, reorderPreviewSchema } from "./reorderSuggestions.schemas";
import { buildSuggestions } from "./reorderSuggestions.service";

export const reorderSuggestionsRouter = Router();

/**
 * Quán được gợi ý. Bỏ trống = chính mình. Khai quán khác đòi `DATA.SCOPE_ALL` và trả **404** như bản
 * ghi không tồn tại, đúng kiểu `assertOwner` — không tiết lộ là tài khoản đó có thật.
 */
function resolveTargetUserId(req: Request, requested?: string): string {
  const self = req.user!.id;
  if (!requested || requested === self) return self;
  if (req.user!.scope !== "ALL") throw new HttpError(404, "Không tìm thấy quán");
  return requested;
}

reorderSuggestionsRouter.post("/preview", requirePermission("REORDER_SUGGESTIONS", "VIEW"), async (req, res) => {
  const input = reorderPreviewSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  const items = await buildSuggestions({ ...input, userId });
  res.json({ items });
});

/**
 * Chốt gợi ý thành đơn NHÁP + ghi nhật ký lượt chạy.
 *
 * SL vào đơn lấy từ `items` (người dùng đã sửa tay), còn `suggestedQty` của agent lưu riêng trong
 * `ReorderRunItem` — cặp số này về sau là căn cứ duy nhất để biết agent lệch ở đâu và theo hướng nào.
 */
reorderSuggestionsRouter.post("/commit", requirePermission("REORDER_SUGGESTIONS", "ADD"), async (req, res) => {
  const input = reorderCommitSchema.parse(req.body);
  const userId = resolveTargetUserId(req, input.userId);
  const actingUserId = req.user!.id;

  // Tính lại gợi ý ở server thay vì tin con số client gửi lên: nhật ký phải ghi được agent ĐÃ đề xuất
  // gì, nếu lấy theo client thì chỉ số sai lệch tự khớp về 0 và mất hết ý nghĩa.
  const suggestions = await buildSuggestions({ ...input, userId });
  const suggestionByProduct = new Map(suggestions.map((s) => [s.productId, s]));
  const orderedByProduct = new Map(input.items.map((it) => [it.productId, it.quantity]));

  const unknown = input.items.filter((it) => !suggestionByProduct.has(it.productId));
  if (unknown.length > 0) {
    throw new HttpError(400, "Có hàng hoá không nằm trong định lượng order nhanh của quán này");
  }

  // Đơn vẫn thuộc về quán (createdById = userId) để phạm vi dữ liệu và danh sách đơn của quán không
  // đổi. Nhưng nếu người bấm không phải chính quán thì bỏ chấm muộn — xem chú thích ở createSalesOrder.
  const order = await createSalesOrder(
    {
      warehouseId: input.warehouseId,
      orderDate: new Date(),
      note: input.note,
      items: input.items,
      // Gợi ý đặt hàng vốn là "xin thêm hàng", chặn theo tồn kho trung tâm ở đây là vô nghĩa — giống
      // lý do Order nhanh đang gửi cờ này.
      skipStockCheck: true,
    },
    userId,
    { skipLatenessStamp: actingUserId !== userId },
  );

  await prisma.reorderRun.create({
    data: {
      userId,
      createdById: actingUserId,
      coverDays: input.coverDays ?? null,
      salesOrderId: order.id,
      items: {
        create: suggestions
          // Chỉ ghi dòng có ý nghĩa: agent có đề xuất, HOẶC người dùng đưa vào đơn (kể cả khi agent
          // đề xuất 0 — đó chính là ca đáng học nhất). Ghi cả bảng định lượng thì nhật ký phình lên
          // vì hàng trăm dòng 0 − 0 mỗi lượt chạy.
          .filter((s) => s.suggestedQty > 0 || orderedByProduct.has(s.productId))
          .map((s) => ({
            productId: s.productId,
            mode: s.mode,
            onHandQty: s.onHandQty ?? 0,
            dailyUsage: s.dailyUsage,
            usageSource: s.usageSource,
            suggestedQty: s.suggestedQty,
            orderedQty: orderedByProduct.get(s.productId) ?? null,
          })),
      },
    },
  });

  res.status(201).json(order);
});

/**
 * Tồn ước tính để ĐIỀN SẴN cột tồn ở Order nhanh — quán chỉ sửa chỗ lệch thay vì gõ lại cả bảng.
 *
 * Cố ý là endpoint RIÊNG, không nhồi vào /preview: preview nhận tồn do người dùng khai, còn đây là con
 * số hệ thống đoán. Trộn hai thứ vào một phản hồi thì lần sau sẽ có người dùng số đoán như số thật.
 */
reorderSuggestionsRouter.get("/estimated-stock", requirePermission("REORDER_SUGGESTIONS", "VIEW"), async (req, res) => {
  const userId = resolveTargetUserId(req, (req.query.userId as string) || undefined);
  const thresholds = await prisma.productReorderThreshold.findMany({ where: { userId }, select: { productId: true } });
  const estimated = await getEstimatedOnHand({ userId, productIds: thresholds.map((t) => t.productId) });
  res.json({ items: [...estimated.values()] });
});

reorderSuggestionsRouter.get("/runs", requirePermission("REORDER_SUGGESTIONS", "VIEW"), async (req, res) => {
  const { skip, take, page, pageSize } = parsePagination(req, 20);
  const requestedUserId = (req.query.userId as string) || undefined;
  // Danh sách: phạm vi SELF thì ép về chính mình, bỏ qua tham số client — giống ownerWhere, nhưng ở
  // đây cột gắn với quán là `userId` chứ không phải `createdById`.
  const userId = req.user!.scope === "ALL" ? requestedUserId : req.user!.id;

  const where = userId ? { userId } : {};
  const [items, total] = await Promise.all([
    prisma.reorderRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        user: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        salesOrder: { select: { id: true, code: true, status: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    }),
    prisma.reorderRun.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});
