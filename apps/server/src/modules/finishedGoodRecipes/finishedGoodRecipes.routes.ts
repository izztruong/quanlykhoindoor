import { Router } from "express";
import { prisma } from "../../config/db";
import { requirePermission } from "../../middleware/auth";
import { findCostChecksUsingEffectiveDate } from "../../utils/costCheckImpact";
import { HttpError } from "../../utils/httpError";
import { parseDateOnly, vnDateKeyOf } from "../../utils/vnTime";
import { recipeUpdateSchema } from "./finishedGoodRecipes.schemas";

export const finishedGoodRecipesRouter = Router();

/**
 * Công thức được lưu theo PHIÊN BẢN có ngày hiệu lực (`FinishedGoodRecipeVersion`) — Check Cost phải
 * tính theo công thức đúng tại từng mốc, không phải công thức hiện hành.
 *
 * `GET /:id` vẫn trả `{ items }` của phiên bản hiện hành, y hệt hợp đồng cũ, nên web/mobile bản cũ
 * không vỡ. Danh sách mốc nằm ở `GET /:id/versions`.
 */

const itemInclude = { product: { include: { unit: true, recipeUnit: true } } };

/**
 * Mốc gốc cho phiên bản ĐẦU TIÊN của một món: trước mọi dữ liệu kinh doanh, khớp mốc mà migration
 * `20261007090000_recipe_versions_and_price_history` đã dùng.
 *
 * Vì sao không mặc định "hôm nay" cho phiên bản đầu: món khai công thức lần đầu hôm nay rồi lập Check
 * Cost cho tháng trước sẽ phân giải ra "chưa có công thức" → `theoretical = 0` → variance nổ bằng toàn
 * bộ lượng đã dùng. Công thức đầu tiên phải áp cho cả quá khứ.
 */
const ORIGIN_DATE_KEY = "2000-01-01";

/**
 * `?shopUserId=` → chỉ phiên bản RIÊNG của quán đó; bỏ trống → phiên bản CHUNG.
 *
 * Cố ý KHÔNG trộn mốc chung vào kết quả: bảng hiện ra phải khớp 1-1 với thứ sửa/xoá được ở phạm vi
 * đang chọn. Giao diện biết quán đang lùi về bản chung nhờ `sharedCount` trả kèm.
 */
function readShopScope(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

async function currentVersion(finishedGoodItemId: string, shopUserId: string | null) {
  return prisma.finishedGoodRecipeVersion.findFirst({
    where: { finishedGoodItemId, shopUserId },
    orderBy: { effectiveFrom: "desc" },
    include: { items: { include: itemInclude, orderBy: { product: { name: "asc" } } } },
  });
}

finishedGoodRecipesRouter.get("/:finishedGoodItemId", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const shopUserId = readShopScope(req.query.shopUserId);
  const version = await currentVersion(req.params.finishedGoodItemId as string, shopUserId);
  res.json({ items: version?.items ?? [], version: version ? { id: version.id, effectiveFrom: version.effectiveFrom } : null });
});

/** Danh sách mốc công thức của một món, mới nhất trước — cho trang công thức bên web. */
finishedGoodRecipesRouter.get("/:finishedGoodItemId/versions", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const finishedGoodItemId = req.params.finishedGoodItemId as string;
  const shopUserId = readShopScope(req.query.shopUserId);

  const [items, sharedCount] = await Promise.all([
    prisma.finishedGoodRecipeVersion.findMany({
      where: { finishedGoodItemId, shopUserId },
      orderBy: { effectiveFrom: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        items: { include: itemInclude, orderBy: { product: { name: "asc" } } },
      },
    }),
    shopUserId
      ? prisma.finishedGoodRecipeVersion.count({ where: { finishedGoodItemId, shopUserId: null } })
      : Promise.resolve(0),
  ]);
  res.json({ items, sharedCount });
});

finishedGoodRecipesRouter.put("/:finishedGoodItemId", requirePermission("FINISHED_GOODS"), async (req, res) => {
  const { finishedGoodItemId } = req.params;
  const data = recipeUpdateSchema.parse(req.body);

  const finishedGoodItem = await prisma.finishedGoodItem.findUnique({ where: { id: finishedGoodItemId } });
  if (!finishedGoodItem) throw new HttpError(404, "Không tìm thấy đồ thành phẩm");

  const shopUserId = data.shopUserId ?? null;
  if (shopUserId) {
    const shop = await prisma.user.findUnique({ where: { id: shopUserId }, select: { role: { select: { isShop: true } } } });
    if (!shop) throw new HttpError(404, "Không tìm thấy quán");
    if (!shop.role.isShop) throw new HttpError(400, "Chỉ khai công thức riêng được cho tài khoản thuộc vai trò là quán");
  }

  const existingCount = await prisma.finishedGoodRecipeVersion.count({ where: { finishedGoodItemId, shopUserId } });
  // Phiên bản đầu tiên áp cho cả quá khứ; từ phiên bản thứ hai thì mặc định hôm nay (giờ VN, không
  // phải giờ máy chủ — Render chạy UTC nên sau 17h giờ VN là đã sang ngày hôm sau theo UTC).
  //
  // NGOẠI LỆ cho phạm vi QUÁN: bản riêng đầu tiên mặc định HÔM NAY, không phải mốc gốc. Luật đắp bù
  // của `RecipeHistory` đã phủ quá khứ bằng bản CHUNG rồi, nên lấy mốc gốc ở đây là xoá sạch lịch sử
  // chung khỏi quá khứ của quán — đúng thứ `ORIGIN_DATE_KEY` được dựng ra để tránh, nhưng ngược dấu.
  const effectiveFromKey =
    data.effectiveFrom ?? (existingCount === 0 && !shopUserId ? ORIGIN_DATE_KEY : vnDateKeyOf(new Date()));
  const effectiveFrom = parseDateOnly(effectiveFromKey);

  // `findUnique` theo compound unique không dùng được nữa vì khoá có `shopUserId` nullable, mà SQL
  // không khớp được NULL = NULL — xem chú thích ở `recordPriceChange`.
  const existingAtDate = await prisma.finishedGoodRecipeVersion.findFirst({
    where: { finishedGoodItemId, shopUserId, effectiveFrom },
    select: { id: true },
  });
  if (existingAtDate && !data.overwrite) {
    throw new HttpError(
      409,
      `Đã có phiên bản công thức áp dụng từ ${effectiveFromKey}. Chọn một ngày hiệu lực khác để tạo mốc mới, hoặc xác nhận ghi đè mốc này.`,
    );
  }

  const version = await prisma.$transaction(async (tx) => {
    // Ghi đè = xoá trọn bộ dòng của mốc đó rồi tạo lại; tạo mốc mới thì chỉ thêm. Cả hai đường đều
    // "thay cả bộ" nên gửi thiếu dòng nào là bỏ nguyên liệu đó khỏi phiên bản — không cần dòng mộ.
    const versionId =
      existingAtDate?.id ??
      (
        await tx.finishedGoodRecipeVersion.create({
          data: { finishedGoodItemId, shopUserId, effectiveFrom, createdById: req.user?.id },
          select: { id: true },
        })
      ).id;

    if (existingAtDate) await tx.finishedGoodRecipeItem.deleteMany({ where: { versionId } });

    if (data.items.length > 0) {
      await tx.finishedGoodRecipeItem.createMany({
        data: data.items.map((it) => ({ versionId, productId: it.productId, quantityPerUnit: it.quantityPerUnit })),
      });
    }

    return tx.finishedGoodRecipeVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { items: { include: itemInclude, orderBy: { product: { name: "asc" } } } },
    });
  });

  // Phiếu Check Cost đã chốt số trong reportSnapshot nên KHÔNG tự đổi; cảnh báo để admin biết phiếu
  // nào nên huỷ và tạo lại. Xem utils/costCheckImpact.ts.
  const affectedCostChecks = await findCostChecksUsingEffectiveDate(effectiveFrom, shopUserId);

  res.json({
    items: version.items,
    version: { id: version.id, effectiveFrom: version.effectiveFrom },
    affectedCostChecks,
  });
});

/** Xoá một mốc công thức — cho trường hợp gõ sai ngày hiệu lực. */
finishedGoodRecipesRouter.delete(
  "/:finishedGoodItemId/versions/:versionId",
  requirePermission("FINISHED_GOODS", "DELETE"),
  async (req, res) => {
    const { finishedGoodItemId, versionId } = req.params;
    const version = await prisma.finishedGoodRecipeVersion.findUnique({
      where: { id: versionId },
      select: { finishedGoodItemId: true, effectiveFrom: true, shopUserId: true },
    });
    if (!version || version.finishedGoodItemId !== finishedGoodItemId) {
      throw new HttpError(404, "Không tìm thấy phiên bản công thức");
    }

    const affectedCostChecks = await findCostChecksUsingEffectiveDate(version.effectiveFrom, version.shopUserId);
    await prisma.finishedGoodRecipeVersion.delete({ where: { id: versionId } });
    res.json({ affectedCostChecks });
  },
);
