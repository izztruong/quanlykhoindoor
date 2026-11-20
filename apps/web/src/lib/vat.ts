/**
 * Cộng VAT vào một số tiền để HIỂN THỊ (giá/thành tiền có VAT ở phiếu nhập kho). Không lưu đi đâu.
 *
 * `vatPercent` là PHẦN TRĂM (8 = 8%), không phải hệ số — cùng quy ước với `apps/server/src/utils/vat.ts`.
 * NULL, rỗng, 0 hay số không hợp lệ đều coi như không VAT. Làm tròn tới đồng.
 */
export function withVat(amount: number | string, vatPercent: number | string | null | undefined): number {
  const pct = vatPercent == null || vatPercent === "" ? 0 : Number(vatPercent);
  const factor = Number.isFinite(pct) && pct > 0 ? 1 + pct / 100 : 1;
  return Math.round(Number(amount) * factor);
}

/** Hiện VAT% gọn: `8.00` → `8%`, NULL → `—`. */
export function formatVatPercent(vatPercent: number | string | null | undefined): string {
  if (vatPercent == null || vatPercent === "") return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Number(vatPercent))}%`;
}
