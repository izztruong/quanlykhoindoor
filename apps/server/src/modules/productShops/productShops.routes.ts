import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { productShopWhere, resolveMenuShopId } from "../../utils/shopMenu";
import { productShopPutSchema } from "./productShops.schemas";

/**
 * Hàng hoá nào có ở quán nào. Song sinh với `finishedGoodMenus`, xem chú thích nghiệp vụ ở
 * `utils/shopMenu.ts` và ở model `ProductShop`.
 */

export const productShopsRouter = Router();

/** Danh sách id hàng hoá đã gán cho một quán. Rỗng = quán đó chưa gán gì, tức đang thấy mọi hàng. */
productShopsRouter.get("/", requirePermission("PRODUCTS", "VIEW"), async (req, res) => {
  const shopUserId = String(req.query.shopUserId ?? "");
  if (!shopUserId) throw new HttpError(400, "Thiếu quán");

  const [rows, counted] = await Promise.all([
    prisma.productShop.findMany({ where: { shopUserId }, select: { productId: true } }),
    // Hàng mà CHÍNH quán này đã từng kiểm khác 0 — giao diện cần để cảnh báo trước khi ẩn, vì ẩn
    // một hàng đang có tồn làm Check Cost tính tồn kỳ sau bằng 0.
    prisma.stockCheckItem.findMany({
      where: { stockCheck: { createdById: shopUserId } },
      select: { productId: true, wholeQuantity: true, looseQuantity: true },
    }),
  ]);

  const countedProductIds = [
    ...new Set(
      counted
        .filter((it) => Number(it.wholeQuantity ?? 0) + Number(it.looseQuantity ?? 0) > 0)
        .map((it) => it.productId),
    ),
  ];

  res.json({ shopUserId, productIds: rows.map((r) => r.productId), countedProductIds });
});

/**
 * Gán/bỏ gán hàng hoá cho MỘT quán. Chỉ nhận dòng người dùng đã sửa.
 *
 * Trả 409 kèm HAI danh sách khi chưa có `confirmWarnings`:
 *
 * - `willBecomeGlobal` — bỏ tích quán cuối cùng ⇒ hàng thành "mọi quán", RỘNG hơn chứ không hẹp hơn.
 * - `hasHistory` — hàng mà chính quán đó đã từng kiểm khác 0. Ẩn đi thì tồn đầu/cuối kỳ của nó tính
 *   bằng 0 ở các phiếu Check Cost lập sau, làm cột chênh lệch sai. Đây là cảnh báo KHÔNG có ở menu
 *   đồ thành phẩm, và là lý do route này không dùng lại được nguyên router của menu.
 */
productShopsRouter.put("/", requirePermission("PRODUCTS", "EDIT"), async (req, res) => {
  const { shopUserId, items, confirmWarnings } = productShopPutSchema.parse(req.body);

  const shop = await prisma.user.findUnique({
    where: { id: shopUserId },
    select: { role: { select: { isShop: true } } },
  });
  if (!shop) throw new HttpError(404, "Không tìm thấy quán");
  if (!shop.role.isShop) throw new HttpError(400, "Chỉ gán được cho tài khoản thuộc vai trò là quán");

  const toAssign = items.filter((it) => it.assigned).map((it) => it.productId);
  const toRemove = items.filter((it) => !it.assigned).map((it) => it.productId);

  if (toRemove.length > 0 && !confirmWarnings) {
    const [willBecomeGlobal, countedRows] = await Promise.all([
      prisma.product.findMany({
        where: {
          id: { in: toRemove },
          shops: { some: { shopUserId } },
          NOT: { shops: { some: { shopUserId: { not: shopUserId } } } },
        },
        select: { code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.stockCheckItem.findMany({
        where: { productId: { in: toRemove }, stockCheck: { createdById: shopUserId } },
        select: { productId: true, wholeQuantity: true, looseQuantity: true },
      }),
    ]);

    const countedIds = [
      ...new Set(
        countedRows
          .filter((it) => Number(it.wholeQuantity ?? 0) + Number(it.looseQuantity ?? 0) > 0)
          .map((it) => it.productId),
      ),
    ];
    const hasHistory =
      countedIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: countedIds } },
            select: { code: true, name: true },
            orderBy: { name: "asc" },
          })
        : [];

    if (willBecomeGlobal.length > 0 || hasHistory.length > 0) {
      res.status(409).json({
        message: "Cần xác nhận trước khi ẩn hàng hoá khỏi quán",
        willBecomeGlobal,
        hasHistory,
      });
      return;
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (toRemove.length > 0) {
    operations.push(prisma.productShop.deleteMany({ where: { shopUserId, productId: { in: toRemove } } }));
  }
  if (toAssign.length > 0) {
    operations.push(
      prisma.productShop.createMany({
        data: toAssign.map((productId) => ({ shopUserId, productId })),
        skipDuplicates: true,
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const rows = await prisma.productShop.findMany({ where: { shopUserId }, select: { productId: true } });
  res.json({ shopUserId, productIds: rows.map((r) => r.productId) });
});

// ---------------------------------------------------------------------------
// Tiếp quản GET /api/products để lọc theo danh sách hàng hoá của quán.
// Mount TRƯỚC productsRouter trên cùng path.
// ---------------------------------------------------------------------------

/**
 * Chỉ tiếp quản `GET /`; mọi route khác rơi xuống crudFactory.
 *
 * PHẢI chép lại đủ bộ lọc của `productsRouter` (`productGroupId`, `type`, và `active` là cột
 * Boolean nên phải ép kiểu) — form phiếu kiểm gọi `?active=true`, mất bộ lọc đó là hàng đã ngừng
 * dùng lại hiện ra trong phiếu mới.
 *
 * Giữ nguyên `publicRead`: tài khoản quán không có `PRODUCTS.VIEW` vẫn phải đọc được danh mục để
 * lập phiếu. `GET /:id` cố ý không lọc, cùng lý do như bên đồ thành phẩm.
 */
export const productMenuScopeRouter = Router();

productMenuScopeRouter.get("/", async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const search = typeof query.search === "string" ? query.search : "";
  const shopUserId = resolveMenuShopId(req.user, query.shopUserId);
  const { skip, take, page, pageSize } = parsePagination(req, 100);

  const searchWhere: Prisma.ProductWhereInput = search
    ? {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};

  const filterWhere: Prisma.ProductWhereInput = {};
  if (query.productGroupId) filterWhere.productGroupId = query.productGroupId;
  if (query.type) filterWhere.type = query.type as Prisma.ProductWhereInput["type"];
  if (query.active) filterWhere.active = query.active === "true";

  const where: Prisma.ProductWhereInput = { AND: [searchWhere, filterWhere, productShopWhere(shopUserId)] };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      include: { unit: true, productGroup: true, recipeUnit: true, shops: { select: { shopUserId: true } } },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
});
