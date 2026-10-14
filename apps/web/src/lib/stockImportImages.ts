/**
 * Đính ảnh chứng từ cho NHIỀU phiếu nhập kho một lượt, ghép theo **tên file**.
 *
 * Tách hẳn khỏi đường nhập Excel: tên ảnh mang **mã phiếu thật** (`PN…`) chứ không phải mã phiếu tạm
 * của file Excel. Mã tạm chỉ tồn tại trong file, không lưu vào DB, nên dùng nó thì đóng trình duyệt
 * là mất bản đồ — còn mã phiếu thì tra lại lúc nào cũng được.
 */

/**
 * Trần ảnh cho đường đính HÀNG LOẠT — cố ý **thấp hơn** `MAX_IMAGES_PER_IMPORT = 5` của server
 * (`stockImports.schemas.ts`). Đính thủ công ở trang chi tiết vẫn 5 ảnh; ở đây 2 là đủ (hoá đơn +
 * phiếu giao) và giữ quy ước đặt tên chỉ còn đúng hai dạng. Đừng "thống nhất" hai con số này làm một.
 */
export const MAX_BULK_IMAGES_PER_SLIP = 2;

/**
 * Ghép một file ảnh với mã phiếu theo TÊN FILE: `PN261014778870001.jpg` là ảnh thứ nhất của phiếu đó,
 * `PN261014778870001-2.jpg` là ảnh thứ hai.
 *
 * Khớp theo mã **DÀI NHẤT** mà tên file bắt đầu bằng, rồi phần dư phải rỗng hoặc đúng `-<số>`. Mã `PN…`
 * hiện không chứa dấu `-` nên phần "dài nhất" ít khi dùng tới, nhưng giữ thì không hại và nó chặn sẵn
 * trường hợp một mã là tiền tố của mã khác.
 *
 * Trả thêm `index` để phần nhập phát hiện hai file cùng trỏ một vị trí. Không khớp được thì trả `null`
 * để **báo lỗi theo tên file**, không đoán bừa.
 */
export function matchImageToSlipCode(fileName: string, codes: string[]): { code: string; index: number } | null {
  // Bỏ đuôi file; không quan tâm đuôi là gì vì `compressImage` nhận mọi ảnh trình duyệt giải mã được.
  const base = fileName.replace(/\.[^.]*$/, "").trim();
  if (!base) return null;

  const candidates = [...codes].sort((a, b) => b.length - a.length);
  for (const code of candidates) {
    if (!base.startsWith(code)) continue;
    const rest = base.slice(code.length);
    if (rest === "") return { code, index: 1 };
    const matched = /^-(\d+)$/.exec(rest);
    if (matched) return { code, index: Number(matched[1]) };
  }
  return null;
}
