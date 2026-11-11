import { Router } from "express";
import { prisma } from "../../config/db";
import type { Prisma } from "../../generated/prisma/client";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { parsePagination } from "../../utils/pagination";
import { finishedGoodMenuPutSchema } from "./finishedGoodMenus.schemas";
import { menuWhere, resolveEffectiveSellingPrices, resolveMenuShopId } from "../../utils/shopMenu";

/**
 * Menu đồ thành phẩm theo quán — xem chú thích nghiệp vụ ở `utils/shopMenu.ts` và ở
 * model `FinishedGoodItemShop`.
 */

export const finishedGoodMenusRouter = Router();

/** Danh sách id món đã gán cho một quán. Rỗng = quán đó chưa gán gì, tức đang thấy mọi món. */
finishedGoodMenusRouter.get("/", requirePermission("FINISHED_GOODS", "VIEW"), async (req, res) => {
  const shopUserId = String(req.query.shopUserId ?? "");
  if (!shopUserId) throw new HttpError(400, "Thiếu quán");

  const rows = await prisma.finishedGoodItemShop.findMany({
    where: { shopUserId },
    select: { finishedGoodItemId: true },
  });
  res.json({ shopUserId, finishedGoodItemIds: rows.map((r) => r.finishedGoodItemId) });
});

/**
 * Gán/bỏ gán món cho MỘT quán. Chỉ nhận những dòng người dùng đã sửa, nên lưu một ô tích không kéo
 * theo mấy trăm lệnh ghi (cùng lý do như `reorderThresholds`).
 *
 * Trả 409 kèm `willBecomeGlobal` khi lần lưu này xoá dòng gán CUỐI CÙNG của một món: quy ước
 * "chưa gán = mọi quán thấy" khiến thao tác đó NỚI RỘNG phạm vi chứ không thu hẹp, trái hẳn trực
 * giác của người đang bỏ tích. Giao diện hỏi lại rồi gửi lại kèm `confirmGlobal: true`.
 */
finishedGoodMenusRouter.put("/", requirePermission("FINISHED_GOODS", "EDIT"), async (req, res) => {
  const { shopUserId, items, confirmGlobal } = finishedGoodMenuPutSchema.parse(req.body);

  // Chỉ gán được cho tài khoản thuộc vai trò "Là quán" — cùng luật như `assertAssignableShop` của
  // module kho. Gán cho một tài khoản không phải quán là tạo menu không bao giờ có ai dùng tới.
  const shop = await prisma.user.findUnique({ where: { id: shopUserId }, select: { role: { select: { isShop: true } } } });
  if (!shop) throw new HttpError(404, "Không tìm thấy quán");
  if (!shop.role.isShop) throw new HttpError(400, "Chỉ gán menu được cho tài khoản thuộc vai trò là quán");

  const toAssign = items.filter((it) => it.assigned).map((it) => it.finishedGoodItemId);
  const toRemove = items.filter((it) => !it.assigned).map((it) => it.finishedGoodItemId);

  if (toRemove.length > 0 && !confirmGlobal) {
    const willBecomeGlobal = await prisma.finishedGoodItem.findMany({
      where: {
        id: { in: toRemove },
        shops: { some: { shopUserId } },
        // Đúng một dòng gán, và dòng đó là của quán đang bỏ tích → bỏ xong là món thành "mọi quán".
        NOT: { shops: { some: { shopUserId: { not: shopUserId } } } },
      },
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });
    if (willBecomeGlobal.length > 0) {
      res.status(409).json({
        message: "Bỏ tích quán cuối cùng sẽ làm món hiện ở MỌI quán",
        willBecomeGlobal,
      });
      return;
    }
  }

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (toRemove.length > 0) {
    operations.push(
      prisma.finishedGoodItemShop.deleteMany({ where: { shopUserId, finishedGoodItemId: { in: toRemove } } }),
    );
  }
  if (toAssign.length > 0) {
    // skipDuplicates: trang gửi lại một ô đã tích sẵn là chuyện thường, không phải lỗi.
    operations.push(
      prisma.finishedGoodItemShop.createMany({
        data: toAssign.map((finishedGoodItemId) => ({ shopUserId, finishedGoodItemId })),
        skipDuplicates: true,
      }),
    );
  }
  if (operations.length > 0) await prisma.$transaction(operations, { timeout: 30000 });

  const rows = await prisma.finishedGoodItemShop.findMany({
    where: { shopUserId },
    select: { finishedGoodItemId: true },
  });
  res.json({ shopUserId, finishedGoodItemIds: rows.map((r) => r.finishedGoodItemId) });
});

// ---------------------------------------------------------------------------
// Tiếp quản GET /api/finished-good-items để lọc theo menu quán.
// Mount TRƯỚC finishedGoodItemPriceSyncRouter và finishedGoodItemsRouter trên cùng path.
// ---------------------------------------------------------------------------

/**
 * Chỉ tiếp quản `GET /`. Các route còn lại rơi xuống hai router sau.
 *
 * GIỮ NGUYÊN `publicRead` của crudFactory — chỉ cần đăng nhập, KHÔNG `requirePermission`. Đó chính
 * là điểm của router này: tài khoản quán không có `FINISHED_GOODS.VIEW` vẫn phải đọc được menu của
 * mình để lập phiếu. Phần thu hẹp đến hoàn toàn từ `resolveMenuShopId`, nên hàm đó mới là chỗ
 * không được tin query string.
 *
 * `GET /:id` CỐ Ý không lọc: trang sửa công thức và sửa giá tra món theo id, phiếu cũ phân giải tên
 * món qua `include` của chính phiếu, nên trả 404 ở đó không bảo vệ được gì mà chỉ làm hỏng hai
 * trang quản trị — và một danh mục đang `publicRead` thì vốn không phải thứ bí mật.
 */
export const finishedGoodItemMenuScopeRouter = Router();

finishedGoodItemMenuScopeRouter.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : "";
  const shopUserId = resolveMenuShopId(req.user, typeof req.query.shopUserId === "string" ? req.query.shopUserId : undefined);
  const { skip, take, page, pageSize } = parsePagination(req, 100);

  const searchWhere: Prisma.FinishedGoodItemWhereInput = search
    ? {
        OR: [
          { code: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ],
      }
    : {};
  const where: Prisma.FinishedGoodItemWhereInput = { AND: [searchWhere, menuWhere(shopUserId)] };

  const [items, total] = await Promise.all([
    prisma.finishedGoodItem.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      // `shops` để giao diện hiện được "mọi quán" / "đang gán cho N quán" mà không phải gọi thêm.
      include: { unit: true, shops: { select: { shopUserId: true } } },
    }),
    prisma.finishedGoodItem.count({ where }),
  ]);

  // Giá mặc định của phiếu kiểm kê quán phải là giá CỦA QUÁN, không phải cột mirror (mirror mang
  // nghĩa giá của bản CHUNG). Một query thêm cho các id của trang này.
  const effective = await resolveEffectiveSellingPrices(
    items.map((it) => it.id),
    shopUserId,
  );

  res.json({
    items: items.map((it) => ({ ...it, effectiveSellingPrice: effective.get(it.id) ?? null })),
    total,
    page,
    pageSize,
  });
});
