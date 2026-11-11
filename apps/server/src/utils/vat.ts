/**
 * Cộng VAT vào giá, dùng cho phiếu Check Cost lập với cờ `useVat`.
 *
 * Quy ước: giá khai trong danh mục (`Product.costPrice`, `FinishedGoodItem.sellingPrice` và mọi mốc
 * `FinishedGoodPrice`) là giá **TRƯỚC thuế**; bật cờ thì phiếu tính bằng `giá × (1 + VAT%)`. `vatPercent`
 * là PHẦN TRĂM (8 nghĩa là 8%), không phải hệ số — chia 100 nằm ở đúng một chỗ, trong `vatMultiplier`.
 *
 * VAT **không** phải mốc theo thời gian như giá bán: nó là một con số hiện hành trên danh mục, không có
 * lịch sử. Phiếu đã lập không bị ảnh hưởng khi đổi % VAT vì `CostCheck.reportSnapshot` đã chốt cứng số
 * liệu. Nếu về sau cần VAT theo mốc hiệu lực thì phải thêm bảng riêng — đừng nhét vào `FinishedGoodPrice`,
 * bảng đó đã có `shopUserId` nullable trong khoá unique và một index một phần viết tay.
 */

/**
 * `8` → `1.08`. Cờ tắt, VAT để trống (NULL) hoặc 0 đều trả `1`, tức giá giữ nguyên.
 *
 * Nhận `unknown` vì nguồn là `Decimal` của Prisma, `number` của JSON hay `null` — cùng khuôn với
 * `toRecipeUnit` trong `costChecks.service.ts`.
 */
export function vatMultiplier(vatPercent: unknown, useVat: boolean): number {
  if (!useVat || vatPercent == null) return 1;
  const pct = Number(vatPercent);
  return Number.isFinite(pct) && pct > 0 ? 1 + pct / 100 : 1;
}

/**
 * Giá vốn của MỘT đơn vị công thức, đã cộng VAT nếu phiếu bật cờ.
 *
 * Gom vào đây vì phép này trước đó bị chép ở hai chỗ — `costChecks.service.ts` (Check Cost của quán) và
 * `bakeryCostChecks.service.ts` (Check Cost của tiệm bánh) — và hai bản còn lệch nhau: bản của quán chia
 * `/ factor` không có chốt `|| 1` nên hàng hoá khai quy đổi bằng 0 cho ra `Infinity`. Bản gộp này lấy
 * chốt `|| 1` của bên tiệm bánh.
 */
export function costPerRecipeUnit(
  product: { costPrice: unknown; recipeUnitsPerBaseUnit: unknown; vatPercent: unknown },
  useVat: boolean,
): number {
  const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
  return (Number(product.costPrice) / (factor || 1)) * vatMultiplier(product.vatPercent, useVat);
}
