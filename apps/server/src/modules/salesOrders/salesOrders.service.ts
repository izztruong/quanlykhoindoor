import { prisma } from "../../config/db";
import { Prisma } from "../../generated/prisma/client";
import { assertOwner, can, type AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { type AffectedCostCheck, findCostChecksUsingPeriodRecord } from "../../utils/costCheckImpact";
import { stampSalesOrderLateness } from "../../utils/deadlines";
import { HttpError } from "../../utils/httpError";
import { getInventoryCountReport } from "../reports/reports.service";
import type { z } from "zod";
import type { salesOrderCreateSchema, salesOrderProcessSchema } from "./salesOrders.schemas";

export const salesOrderDetailInclude = {
  warehouse: true,
  stockExport: {
    include: {
      items: { include: { product: { include: { unit: true } }, supplier: true } },
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  // Chỉ đếm ảnh chứng từ, không ký URL — URL chỉ ký ở GET .../items/:itemId/images khi mở ảnh.
  items: { include: { product: { include: { unit: true, productGroup: true } }, _count: { select: { images: true } } } },
};

/**
 * Phẳng hoá `_count.images` của từng dòng hàng thành `imageCount`, để payload API không lộ hình dạng
 * truy vấn Prisma (cùng lý do `toApiRow` ở shiftExpenses). Mọi chỗ trả đơn theo
 * `salesOrderDetailInclude` phải đi qua hàm này.
 */
export function withItemImageCounts<I extends { _count: { images: number } }, O>(order: O & { items: I[] }) {
  const { items, ...rest } = order;
  return { ...rest, items: items.map(({ _count, ...item }) => ({ ...item, imageCount: _count.images })) };
}

/**
 * Bảng danh sách chỉ hiện mã đơn, tài khoản, kho, ngày đặt, tổng số lượng và trạng thái. Dùng
 * chung `salesOrderDetailInclude` khiến mỗi đơn kéo theo cả phiếu xuất kho (kèm từng dòng hàng và
 * nhà cung cấp) lẫn thông tin đầy đủ của từng sản phẩm — đo được 187 KB cho 20 đơn, trong khi
 * `stockExport` không được dùng một lần nào trên trang đó.
 *
 * Ở đây chỉ lấy đúng phần bảng cần. Riêng số lượng vẫn phải lấy thô từng dòng để cộng, nhưng
 * `select: { quantity: true }` khiến mỗi dòng chỉ còn một con số thay vì cả object sản phẩm, và
 * mảng này bị bỏ khỏi payload sau khi cộng xong (xem route GET "/").
 */
export const salesOrderListInclude = {
  warehouse: true,
  createdBy: { select: { id: true, name: true, email: true } },
  items: { select: { quantity: true } },
};

type SalesOrderCreateInput = z.infer<typeof salesOrderCreateSchema>;
type SalesOrderProcessInput = z.infer<typeof salesOrderProcessSchema>;

/**
 * An order can't ask for more of a product than is currently on hand in its
 * warehouse — checked against system stock as of right now (cumulative
 * imports/exports to date, same figure as the "Tồn kho hiện tại" page).
 */
async function assertSufficientStock(warehouseId: string, items: { productId: string; quantity: number }[]) {
  const now = new Date();
  const { items: stockItems } = await getInventoryCountReport({ warehouseId, periodStart: now, periodEnd: now });
  const stockByProductId = new Map(stockItems.map((s) => [s.product.id, s]));

  for (const item of items) {
    const stock = stockByProductId.get(item.productId);
    const available = stock?.systemQty ?? 0;
    if (item.quantity > available) {
      const name = stock?.product.name ?? item.productId;
      throw new HttpError(400, `Số lượng đặt cho "${name}" (${item.quantity}) vượt quá tồn kho hiện có (${available})`);
    }
  }
}

export async function createSalesOrder(data: SalesOrderCreateInput, createdById?: string) {
  if (!data.skipStockCheck) await assertSufficientStock(data.warehouseId, data.items);

  // Ghi createdAt tường minh thay vì để DB tự điền: dấu đúng hạn/muộn phải được chấm theo đúng
  // mốc lưu trong cột, nếu lấy hai nguồn thời gian khác nhau thì đơn sát giờ hạn có thể bị chấm
  // lệch với chính con số hiển thị bên cạnh nó.
  const createdAt = new Date();
  const lateness = await stampSalesOrderLateness(createdAt);

  const order = await prisma.salesOrder.create({
    data: {
      code: generateCode("DH"),
      warehouseId: data.warehouseId,
      orderDate: data.orderDate,
      note: data.note,
      createdById,
      createdAt,
      dueAt: lateness.dueAt,
      isLate: lateness.isLate,
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      },
    },
    include: salesOrderDetailInclude,
  });
  return withItemImageCounts(order);
}

export async function replaceSalesOrderItems(orderId: string, data: SalesOrderCreateInput, actingUser?: AuthUser) {
  if (!data.skipStockCheck) await assertSufficientStock(data.warehouseId, data.items);

  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
    assertOwner(order, actingUser, "Không tìm thấy đơn hàng");
    if (order.status !== "DRAFT") throw new HttpError(409, "Chỉ sửa được đơn hàng chưa xử lý");

    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: orderId } });

    return tx.salesOrder.update({
      where: { id: orderId },
      data: {
        warehouseId: data.warehouseId,
        orderDate: data.orderDate,
        note: data.note,
        items: {
          create: data.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          })),
        },
      },
      include: salesOrderDetailInclude,
    });
  });
  return withItemImageCounts(updated);
}

/**
 * Đổi trạng thái tay chỉ còn huỷ (schema chỉ nhận CANCELLED). Hoàn thành đơn phải qua
 * processSalesOrder vì nó còn ghi SL nhận và phiếu xuất kho. ORDERS.ADD chỉ huỷ được đơn chưa xử lý
 * của mình (phạm vi kiểm ở assertOwner); ORDERS.APPROVE huỷ được mọi đơn chưa xử lý.
 */
export async function updateSalesOrderStatus(orderId: string, status: "CANCELLED", actingUser?: AuthUser) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  assertOwner(order, actingUser, "Không tìm thấy đơn hàng");
  // Đơn đã hoàn thành đã trừ tồn kho qua phiếu xuất — huỷ ở đây sẽ để phiếu xuất mồ côi.
  if (order.status !== "DRAFT") throw new HttpError(409, "Chỉ huỷ được đơn hàng chưa xử lý");

  const updated = await prisma.salesOrder.update({ where: { id: orderId }, data: { status }, include: salesOrderDetailInclude });
  return withItemImageCounts(updated);
}

/**
 * Admin xử lý đơn — dùng cho cả lần đầu (DRAFT) lẫn sửa lại đơn đã COMPLETED. Mỗi hàng hoá mang
 * 1..n dòng NCC; SL nhận của hàng = tổng SL các dòng đó, và các dòng NCC thay TOÀN BỘ dòng của
 * phiếu xuất kho liên kết (chưa có phiếu thì tạo mới). Không xoá dòng hàng: muốn bỏ thì SL = 0, nhờ
 * vậy ảnh chứng từ gắn theo dòng không mất.
 *
 * Đơn đã COMPLETED thì Check Cost đã có thể tính nó vào kỳ — trả về các phiếu Check Cost có kỳ trùm
 * ngày nhận CŨ hoặc MỚI của những dòng đổi SL/ngày, để admin tạo lại (số Check Cost đã chốt cứng).
 */
export async function processSalesOrder(orderId: string, data: SalesOrderProcessInput, actingUser?: AuthUser) {
  if (!can(actingUser, "ORDERS", "APPROVE")) {
    throw new HttpError(403, "Chỉ người có quyền xử lý đơn mới được nhập nhận hàng");
  }

  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true } }, stockExport: true },
  });
  if (!order) throw new HttpError(404, "Không tìm thấy đơn hàng");
  if (order.status === "CANCELLED") throw new HttpError(409, "Đơn hàng đã huỷ, không xử lý được");

  const itemById = new Map(order.items.map((it) => [it.id, it]));
  const existingProductIds = new Set(order.items.map((it) => it.productId));
  const seenItemIds = new Set<string>();
  const newProductIds = new Set<string>();
  for (const entry of data.items) {
    if (entry.itemId) {
      if (!itemById.has(entry.itemId)) throw new HttpError(400, "Dòng hàng hoá không thuộc đơn hàng này");
      if (seenItemIds.has(entry.itemId)) throw new HttpError(400, "Một hàng hoá bị gửi hai lần");
      seenItemIds.add(entry.itemId);
    } else {
      const productId = entry.productId!;
      if (existingProductIds.has(productId) || newProductIds.has(productId)) {
        throw new HttpError(400, "Hàng hoá thêm mới đã có trong đơn");
      }
      newProductIds.add(productId);
    }
  }
  // Bắt buộc gửi đủ mọi dòng cũ: thiếu một dòng mà vẫn thay toàn bộ phiếu xuất thì hàng đó mất khỏi
  // phiếu xuất (tồn kho lệch) trong khi SL nhận cũ vẫn nằm trên đơn.
  const missing = order.items.find((it) => !seenItemIds.has(it.id));
  if (missing) throw new HttpError(400, `Thiếu thông tin nhận hàng cho "${missing.product.name}"`);

  if (newProductIds.size > 0) {
    const found = await prisma.product.count({ where: { id: { in: [...newProductIds] } } });
    if (found !== newProductIds.size) throw new HttpError(400, "Có hàng hoá thêm mới không tồn tại");
  }

  const productIdOf = (entry: SalesOrderProcessInput["items"][number]) =>
    entry.itemId ? itemById.get(entry.itemId)!.productId : entry.productId!;

  const linePairs = data.items.flatMap((entry) =>
    entry.lines.filter((line) => line.supplierId).map((line) => ({ productId: productIdOf(entry), supplierId: line.supplierId! })),
  );
  if (linePairs.length > 0) {
    const prices = await prisma.productSupplierPrice.findMany({ where: { OR: linePairs } });
    const pricedPairs = new Set(prices.map((p) => `${p.productId}:${p.supplierId}`));
    if (linePairs.some((p) => !pricedPairs.has(`${p.productId}:${p.supplierId}`))) {
      throw new HttpError(400, "Có hàng hoá chưa được thiết lập giá cho nhà cung cấp đã chọn");
    }
  }

  const now = new Date();
  const rows = data.items.map((entry) => {
    const existing = entry.itemId ? itemById.get(entry.itemId)! : undefined;
    return {
      entry,
      existing,
      productId: productIdOf(entry),
      receivedQuantity: entry.lines.reduce((sum, line) => sum + line.quantity, 0),
      // Không gửi ngày thì giữ ngày đã lưu, chưa có mới lấy giờ lưu — sửa SL không làm trôi ngày nhận.
      receivedAt: entry.receivedAt ?? existing?.receivedAt ?? now,
      note: entry.note?.trim() || null,
    };
  });

  const affectedCostChecks: AffectedCostCheck[] = [];
  if (order.status === "COMPLETED") {
    const affectedDates: Date[] = [];
    for (const row of rows) {
      const prevQty = row.existing?.receivedQuantity != null ? Number(row.existing.receivedQuantity) : 0;
      const prevAt = row.existing?.receivedAt ?? null;
      const qtyChanged = Math.abs(prevQty - row.receivedQuantity) > 1e-9;
      const dateChanged = prevAt?.getTime() !== row.receivedAt.getTime();
      if (!qtyChanged && !dateChanged) continue;
      if (prevAt) affectedDates.push(prevAt);
      affectedDates.push(row.receivedAt);
    }
    const seen = new Set<string>();
    for (const at of affectedDates) {
      for (const cc of await findCostChecksUsingPeriodRecord([order.createdById], at)) {
        if (!seen.has(cc.id)) {
          seen.add(cc.id);
          affectedCostChecks.push(cc);
        }
      }
    }
  }

  const exportLines = rows.flatMap((row) =>
    row.entry.lines.map((line) => ({
      productId: row.productId,
      quantity: line.quantity,
      costPrice: line.costPrice,
      costAmount: line.quantity * line.costPrice,
      supplierId: line.supplierId,
    })),
  );

  // Gom mọi lệnh ghi vào MỘT transaction không tương tác, dòng cũ gộp thành một UPDATE ... FROM
  // (VALUES ...) — Neon chậm, update từng dòng sẽ vượt timeout với đơn nhiều hàng.
  const operations: Prisma.PrismaPromise<unknown>[] = [];

  const newRows = rows.filter((row) => !row.existing);
  if (newRows.length > 0) {
    operations.push(
      prisma.salesOrderItem.createMany({
        data: newRows.map((row) => ({
          salesOrderId: orderId,
          productId: row.productId,
          quantity: 0,
          receivedQuantity: row.receivedQuantity,
          received: true,
          receivedAt: row.receivedAt,
          note: row.note,
        })),
      }),
    );
  }

  const existingRows = rows.filter((row) => row.existing);
  if (existingRows.length > 0) {
    const values = existingRows.map((row) => {
      const received = row.receivedQuantity >= Number(row.existing!.quantity);
      return Prisma.sql`(${row.existing!.id}::text, ${row.receivedQuantity}::numeric, ${received}::boolean, ${row.receivedAt}::timestamp, ${row.note}::text)`;
    });
    operations.push(prisma.$executeRaw`
      UPDATE "SalesOrderItem" AS t
      SET "receivedQuantity" = v."receivedQuantity",
          "received" = v.received,
          "receivedAt" = v."receivedAt",
          "note" = v.note
      FROM (VALUES ${Prisma.join(values)}) AS v(id, "receivedQuantity", received, "receivedAt", note)
      WHERE t.id = v.id
    `);
  }

  if (order.stockExport) {
    const stockExportId = order.stockExport.id;
    operations.push(prisma.stockExportItem.deleteMany({ where: { stockExportId } }));
    operations.push(prisma.stockExportItem.createMany({ data: exportLines.map((line) => ({ ...line, stockExportId })) }));
  } else {
    operations.push(
      prisma.stockExport.create({
        data: {
          code: generateCode("PX"),
          type: "SALE",
          transactionAt: now,
          form: "CASH",
          status: "COMPLETED",
          warehouseId: order.warehouseId,
          salesOrderId: order.id,
          createdById: actingUser?.id,
          items: { create: exportLines },
        },
      }),
    );
  }

  operations.push(
    prisma.salesOrder.update({
      where: { id: orderId },
      data: { status: "COMPLETED", completedAt: order.completedAt ?? now },
    }),
  );

  await prisma.$transaction(operations, { timeout: 20000 });

  const updated = await prisma.salesOrder.findUniqueOrThrow({ where: { id: orderId }, include: salesOrderDetailInclude });
  return {
    order: withItemImageCounts(updated),
    affectedCostChecks,
    // Chỉ lần đầu hoàn thành mới báo quán — sửa lại về sau không bắn thông báo nữa.
    firstCompletion: order.status === "DRAFT",
  };
}
