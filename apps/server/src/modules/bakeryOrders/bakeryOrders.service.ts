import type { z } from "zod";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../../middleware/auth";
import { generateCode } from "../../utils/codeGenerator";
import { findCostChecksUsingPeriodRecords, type AffectedCostCheck } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { assertProductsInShopList, productShopWhere } from "../../utils/shopMenu";
import { resolveTargetUserId } from "../../utils/targetUser";
import { parseDateOnly } from "../../utils/vnTime";
import type {
  bakeryOrderCreateSchema,
  bakeryOrderReceiveSchema,
  bakeryOrderReceivedEditSchema,
  bakeryOrderStepSchema,
} from "./bakeryOrders.schemas";

const NOT_FOUND = "Không tìm thấy order bánh";
const STALE = "Đơn vừa được người khác cập nhật — tải lại trang để xem trạng thái mới";
/** Cùng biên như `assertCheckedAtNotInFuture`: đồng hồ máy người dùng lệch vài phút là chuyện thường. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
/** Cùng lý do như salesOrders: mặc định 5 giây không đủ cho vài chục dòng trên Neon. */
const TX_OPTIONS = { timeout: 20000 };

const person = { select: { id: true, name: true } } as const;

export const bakeryOrderListInclude = {
  shopUser: person,
  supplier: { select: { id: true, code: true, name: true } },
  createdBy: person,
  _count: { select: { items: true } },
} satisfies Prisma.BakeryOrderInclude;

export const bakeryOrderDetailInclude = {
  shopUser: person,
  supplier: { select: { id: true, code: true, name: true, bakeryUserId: true } },
  createdBy: person,
  confirmedBy: person,
  pickedUpBy: person,
  receivedBy: person,
  cancelledBy: person,
  items: {
    include: { product: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } } },
    orderBy: { product: { name: "asc" } },
  },
  stockImport: { select: { id: true, code: true } },
} satisfies Prisma.BakeryOrderInclude;

/**
 * Phạm vi: một đơn thuộc HAI phía — quán đặt và tiệm bánh nhận (qua NCC) — nên khớp một bên là thấy,
 * giống phiếu điều chuyển. Không neo theo `createdById`: admin đặt hộ quán là chuyện thường. Người
 * vận chuyển không thuộc phía nào nên vai trò của họ phải có DATA.SCOPE_ALL.
 */
export function bakeryOrderScopeWhere(user: AuthUser | undefined): Prisma.BakeryOrderWhereInput {
  if (user?.scope === "ALL") return {};
  const id = user?.id ?? "__none__";
  return { OR: [{ shopUserId: id }, { supplier: { bakeryUserId: id } }] };
}

export async function findScopedBakeryOrder(id: string, user: AuthUser | undefined) {
  const order = await prisma.bakeryOrder.findFirst({
    where: { id, ...bakeryOrderScopeWhere(user) },
    include: bakeryOrderDetailInclude,
  });
  if (!order) throw new HttpError(404, NOT_FOUND);
  return order;
}

type ScopedOrder = Awaited<ReturnType<typeof findScopedBakeryOrder>>;

/**
 * Quyền theo action chưa đủ: một tài khoản quán được cấp CONFIRM (vì nó cũng là tiệm bánh của ai
 * đó) vẫn không được xác nhận đơn CHÍNH NÓ đặt. Nên mỗi bước còn chốt đúng phía: tiệm bánh của NCC
 * xác nhận, quán đặt thì huỷ và nhận. Phạm vi ALL (admin) làm thay được mọi phía.
 */
function assertActor(user: AuthUser | undefined, ownerId: string | null, message: string) {
  if (user?.scope === "ALL") return;
  if (!user || user.id !== ownerId) throw new HttpError(403, message);
}

function assertStatus(order: ScopedOrder, expected: ScopedOrder["status"], message: string) {
  if (order.status !== expected) throw new HttpError(409, message);
}

/**
 * Số lượng một bước phải phủ ĐÚNG các dòng của đơn — thiếu một dòng là cột đó rỗng mà không ai biết,
 * thừa một dòng là hàng không có trong đơn.
 */
function stepQuantities(order: ScopedOrder, items: { productId: string; quantity: number }[]): Map<string, number> {
  const byProduct = new Map(items.map((it) => [it.productId, it.quantity]));
  const orderIds = new Set(order.items.map((it) => it.productId));
  const missing = order.items.filter((it) => !byProduct.has(it.productId)).map((it) => it.product.name);
  const extra = items.filter((it) => !orderIds.has(it.productId));
  if (missing.length > 0) throw new HttpError(400, `Thiếu số lượng cho: ${missing.join(", ")}`);
  if (extra.length > 0) throw new HttpError(400, "Có dòng hàng không thuộc đơn này");
  return byProduct;
}

function assertNotInFuture(at: Date) {
  if (at.getTime() > Date.now() + FUTURE_TOLERANCE_MS) throw new HttpError(400, "Thời gian nhận không được ở tương lai");
}

/** Cập nhật trạng thái kèm điều kiện trạng thái cũ — hai người bấm cùng lúc thì người sau nhận 409. */
async function transition(
  tx: Prisma.TransactionClient,
  id: string,
  from: ScopedOrder["status"],
  data: Prisma.BakeryOrderUncheckedUpdateManyInput,
) {
  const { count } = await tx.bakeryOrder.updateMany({ where: { id, status: from }, data });
  if (count === 0) throw new HttpError(409, STALE);
}

async function shopWarehouseId(shopUserId: string, shopName: string): Promise<string> {
  const warehouse = await prisma.warehouse.findUnique({ where: { shopUserId }, select: { id: true } });
  if (!warehouse) {
    throw new HttpError(409, `Quán "${shopName}" chưa có kho — vào Danh mục → Kho hàng để tạo kho cho quán trước`);
  }
  return warehouse.id;
}

/** Dòng phiếu nhập tự sinh: chỉ hàng có SL nhận > 0, giá là giá đã chốt lúc tiệm bánh xác nhận. */
function importLines(order: ScopedOrder, received: Map<string, number>) {
  return order.items
    .map((it) => {
      const quantity = received.get(it.productId) ?? 0;
      const costPrice = it.unitPrice != null ? Number(it.unitPrice) : 0;
      return { productId: it.productId, quantity, costPrice, costAmount: quantity * costPrice };
    })
    .filter((line) => line.quantity > 0);
}

/** Phiếu nhập kho tự sinh của một đơn bánh — một chỗ duy nhất, để bước nhận và bước admin sửa không lệch nhau. */
function createOrderImport(
  tx: Prisma.TransactionClient,
  order: ScopedOrder,
  warehouseId: string,
  transactionAt: Date,
  lines: ReturnType<typeof importLines>,
  createdById: string | undefined,
) {
  return tx.stockImport.create({
    data: {
      code: generateCode("PN"),
      type: "PURCHASE",
      transactionAt,
      // Hàng nội bộ chuỗi, không phải mua bằng tiền mặt hay chuyển khoản.
      form: "OTHER",
      status: "COMPLETED",
      note: `Tự sinh từ order bánh ${order.code}`,
      warehouseId,
      supplierId: order.supplierId,
      createdById,
      bakeryOrderId: order.id,
      items: { create: lines },
    },
  });
}

// ---------------------------------------------------------------------------

/**
 * Dữ liệu cho form đặt: các tiệm bánh (NCC đã nối tài khoản) và bánh quán đặt được từ mỗi tiệm —
 * hàng có giá với NCC đó, đang dùng, và nằm trong danh sách hàng của quán. CỐ Ý không trả giá: bảng
 * giá NCC là dữ liệu nhạy cảm (xem readPricesGuard), mà quán đặt bánh không cần biết giá.
 */
export async function bakeryOrderOptions(user: AuthUser | undefined, requestedShopUserId?: string) {
  const shopUserId = resolveTargetUserId(user, requestedShopUserId);
  const suppliers = await prisma.supplier.findMany({
    where: { bakeryUserId: { not: null, notIn: [shopUserId] } },
    select: {
      id: true,
      name: true,
      productPrices: {
        where: { product: { active: true, ...productShopWhere(shopUserId) } },
        select: { product: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } } },
        orderBy: { product: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });
  return suppliers.map((s) => ({ supplierId: s.id, name: s.name, products: s.productPrices.map((p) => p.product) }));
}

export async function createBakeryOrder(data: z.infer<typeof bakeryOrderCreateSchema>, user: AuthUser | undefined) {
  const shopUserId = resolveTargetUserId(user, data.shopUserId);

  const [shop, supplier] = await Promise.all([
    prisma.user.findUnique({ where: { id: shopUserId }, select: { name: true, role: { select: { isShop: true } } } }),
    prisma.supplier.findUnique({ where: { id: data.supplierId }, select: { name: true, bakeryUserId: true } }),
  ]);
  if (!shop || !shop.role.isShop) throw new HttpError(400, "Chỉ tài khoản quán mới đặt được order bánh");
  if (!supplier) throw new HttpError(404, "Không tìm thấy tiệm bánh");
  if (!supplier.bakeryUserId) {
    throw new HttpError(400, `NCC "${supplier.name}" chưa nối tài khoản tiệm bánh — vào Danh mục → Nhà cung cấp để nối`);
  }
  if (supplier.bakeryUserId === shopUserId) throw new HttpError(400, "Tiệm bánh không đặt bánh của chính mình");

  // Kiểm kho ngay lúc đặt chứ không đợi tới bước nhận: tới lúc đó bánh đã ở trước cửa quán.
  await shopWarehouseId(shopUserId, shop.name);

  const productIds = data.items.map((it) => it.productId);
  await assertProductsInShopList(shopUserId, productIds);

  const priced = await prisma.productSupplierPrice.findMany({
    where: { supplierId: data.supplierId, productId: { in: productIds } },
    select: { productId: true },
  });
  const pricedIds = new Set(priced.map((p) => p.productId));
  const unpriced = productIds.filter((id) => !pricedIds.has(id));
  if (unpriced.length > 0) {
    const names = await prisma.product.findMany({ where: { id: { in: unpriced } }, select: { name: true } });
    throw new HttpError(
      400,
      `Tiệm bánh "${supplier.name}" chưa có giá cho: ${names.map((n) => n.name).join(", ")}. Khai giá ở Quản trị → Giá theo Nhà cung cấp`,
    );
  }

  return prisma.bakeryOrder.create({
    data: {
      code: generateCode("DB"),
      shopUserId,
      supplierId: data.supplierId,
      deliveryOn: parseDateOnly(data.deliveryOn),
      note: data.note,
      createdById: user?.id,
      items: { create: data.items.map((it) => ({ productId: it.productId, orderedQty: it.orderedQty, note: it.note })) },
    },
    include: bakeryOrderDetailInclude,
  });
}

/** Tiệm bánh xác nhận SL nhận làm. Đơn giá chốt ở bước này. */
export async function confirmBakeryOrder(id: string, data: z.infer<typeof bakeryOrderStepSchema>, user: AuthUser | undefined) {
  const order = await findScopedBakeryOrder(id, user);
  assertActor(user, order.supplier.bakeryUserId, "Chỉ tiệm bánh nhận đơn mới xác nhận được");
  assertStatus(order, "ORDERED", "Đơn không còn ở bước chờ tiệm bánh xác nhận");

  const quantities = stepQuantities(order, data.items);
  if ([...quantities.values()].every((q) => q === 0)) {
    throw new HttpError(400, "Mọi dòng đều bằng 0 — muốn không nhận đơn thì bấm Từ chối");
  }

  const prices = await prisma.productSupplierPrice.findMany({
    where: { supplierId: order.supplierId, productId: { in: order.items.map((it) => it.productId) } },
    select: { productId: true, importPrice: true },
  });
  const priceByProduct = new Map(prices.map((p) => [p.productId, p.importPrice]));
  const unpriced = order.items.filter((it) => (quantities.get(it.productId) ?? 0) > 0 && !priceByProduct.has(it.productId));
  if (unpriced.length > 0) {
    throw new HttpError(400, `Chưa có giá nhập cho: ${unpriced.map((it) => it.product.name).join(", ")}`);
  }

  await prisma.$transaction(async (tx) => {
    await transition(tx, id, "ORDERED", { status: "CONFIRMED", confirmedById: user?.id, confirmedAt: new Date() });
    for (const it of order.items) {
      await tx.bakeryOrderItem.update({
        where: { id: it.id },
        data: { confirmedQty: quantities.get(it.productId), unitPrice: priceByProduct.get(it.productId) ?? null },
      });
    }
  }, TX_OPTIONS);

  return findScopedBakeryOrder(id, user);
}

/** Tiệm bánh từ chối cả đơn — cùng quyền CONFIRM, vì đó là một câu trả lời của cùng một bước. */
export async function rejectBakeryOrder(id: string, user: AuthUser | undefined) {
  const order = await findScopedBakeryOrder(id, user);
  assertActor(user, order.supplier.bakeryUserId, "Chỉ tiệm bánh nhận đơn mới từ chối được");
  assertStatus(order, "ORDERED", "Đơn không còn ở bước chờ tiệm bánh xác nhận");
  await prisma.$transaction((tx) =>
    transition(tx, id, "ORDERED", { status: "CANCELLED", cancelledById: user?.id, cancelledAt: new Date() }),
  );
  return findScopedBakeryOrder(id, user);
}

/** Quán huỷ đơn của mình khi tiệm bánh chưa xác nhận. */
export async function cancelBakeryOrder(id: string, user: AuthUser | undefined) {
  const order = await findScopedBakeryOrder(id, user);
  assertActor(user, order.shopUserId, "Chỉ quán đặt đơn mới huỷ được");
  assertStatus(order, "ORDERED", "Tiệm bánh đã xác nhận nên không huỷ được nữa");
  await prisma.$transaction((tx) =>
    transition(tx, id, "ORDERED", { status: "CANCELLED", cancelledById: user?.id, cancelledAt: new Date() }),
  );
  return findScopedBakeryOrder(id, user);
}

/** Người vận chuyển xác nhận SL thực lấy từ tiệm bánh. */
export async function pickUpBakeryOrder(id: string, data: z.infer<typeof bakeryOrderStepSchema>, user: AuthUser | undefined) {
  const order = await findScopedBakeryOrder(id, user);
  assertStatus(order, "CONFIRMED", "Đơn chưa được tiệm bánh xác nhận, hoặc đã có người lấy hàng");
  const quantities = stepQuantities(order, data.items);

  await prisma.$transaction(async (tx) => {
    await transition(tx, id, "CONFIRMED", { status: "IN_TRANSIT", pickedUpById: user?.id, pickedUpAt: new Date() });
    for (const it of order.items) {
      await tx.bakeryOrderItem.update({ where: { id: it.id }, data: { pickedUpQty: quantities.get(it.productId) } });
    }
  }, TX_OPTIONS);

  return findScopedBakeryOrder(id, user);
}

/**
 * Quán xác nhận SL nhận → đơn HOÀN THÀNH và TỰ SINH phiếu nhập kho cho kho quán, trong cùng một
 * transaction. Không sinh "Bánh bán ra" — tiệm bánh tự nhập phần đó.
 */
export async function receiveBakeryOrder(
  id: string,
  data: z.infer<typeof bakeryOrderReceiveSchema>,
  user: AuthUser | undefined,
): Promise<{ order: ScopedOrder; affectedCostChecks: AffectedCostCheck[] }> {
  const order = await findScopedBakeryOrder(id, user);
  assertActor(user, order.shopUserId, "Chỉ quán đặt đơn mới xác nhận nhận hàng được");
  assertStatus(order, "IN_TRANSIT", "Đơn chưa ở bước đang giao");

  const quantities = stepQuantities(order, data.items);
  const receivedAt = data.receivedAt ?? new Date();
  assertNotInFuture(receivedAt);
  const warehouseId = await shopWarehouseId(order.shopUserId, order.shopUser.name);
  const lines = importLines(order, quantities);

  await prisma.$transaction(async (tx) => {
    await transition(tx, id, "IN_TRANSIT", { status: "COMPLETED", receivedById: user?.id, receivedAt });
    for (const it of order.items) {
      await tx.bakeryOrderItem.update({ where: { id: it.id }, data: { receivedQty: quantities.get(it.productId) } });
    }
    // Không nhận được cái nào thì không có hàng vào kho — khỏi sinh một phiếu nhập rỗng.
    if (lines.length > 0) await createOrderImport(tx, order, warehouseId, receivedAt, lines, user?.id);
  }, TX_OPTIONS);

  return {
    order: await findScopedBakeryOrder(id, user),
    affectedCostChecks: await findCostChecksUsingPeriodRecords([{ shopUserId: order.shopUserId, at: receivedAt }]),
  };
}

/**
 * Admin sửa SL nhận và ngày nhận của đơn ĐÃ HOÀN THÀNH. Phiếu nhập tự sinh đổi theo trong cùng
 * transaction — màn phiếu nhập khoá phiếu đó lại, nên đây là đường DUY NHẤT sửa được nó.
 *
 * Cảnh báo Check Cost xét cả mốc CŨ lẫn mốc MỚI, cùng lý do như PUT /stock-imports/:id: dời ngày nhận
 * sang tháng khác là động tới hai kỳ.
 */
export async function editReceivedBakeryOrder(
  id: string,
  data: z.infer<typeof bakeryOrderReceivedEditSchema>,
  user: AuthUser | undefined,
): Promise<{ order: ScopedOrder; affectedCostChecks: AffectedCostCheck[] }> {
  const order = await findScopedBakeryOrder(id, user);
  assertStatus(order, "COMPLETED", "Chỉ sửa được đơn đã hoàn thành");

  const quantities = stepQuantities(order, data.items);
  assertNotInFuture(data.receivedAt);
  const lines = importLines(order, quantities);
  const warehouseId = order.stockImport ? null : await shopWarehouseId(order.shopUserId, order.shopUser.name);

  await prisma.$transaction(async (tx) => {
    await tx.bakeryOrder.update({ where: { id }, data: { receivedAt: data.receivedAt } });
    for (const it of order.items) {
      await tx.bakeryOrderItem.update({ where: { id: it.id }, data: { receivedQty: quantities.get(it.productId) } });
    }

    if (order.stockImport) {
      // Giữ nguyên phiếu (mã đã có thể in ra chứng từ, ảnh đính kèm treo vào nó) — chỉ thay dòng và
      // mốc. Sửa hết về 0 thì phiếu còn lại không dòng nào: vẫn đúng nghĩa "không có hàng vào kho".
      await tx.stockImportItem.deleteMany({ where: { stockImportId: order.stockImport.id } });
      await tx.stockImport.update({
        where: { id: order.stockImport.id },
        data: { transactionAt: data.receivedAt, items: { create: lines } },
      });
    } else if (lines.length > 0 && warehouseId) {
      await createOrderImport(tx, order, warehouseId, data.receivedAt, lines, user?.id);
    }
  }, TX_OPTIONS);

  return {
    order: await findScopedBakeryOrder(id, user),
    affectedCostChecks: await findCostChecksUsingPeriodRecords([
      { shopUserId: order.shopUserId, at: order.receivedAt ?? data.receivedAt },
      { shopUserId: order.shopUserId, at: data.receivedAt },
    ]),
  };
}
