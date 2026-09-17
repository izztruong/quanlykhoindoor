/** API lưu lượng tịnh; form phải hiển thị lượng cân cả vỏ trước khi gửi lại qua subtractTareWeight. */
export function looseQuantityForEditing(net: string | number | null | undefined, tare: string | number | null | undefined): string {
  if (net == null) return "";
  // Tránh hiện đuôi sai số như 0.30000000000000004 khi cộng hai số thập phân.
  return String(Number((Number(net) + Number(tare ?? 0)).toFixed(6)));
}
