/**
 * Đính ảnh chứng từ cho NHIỀU phiếu nhập kho một lượt, ghép theo **tên file**.
 *
 * Tên ảnh mang **mã phiếu**. Mã do người dùng đặt khi nhập Excel (vd `HD001`) hoặc server tự sinh
 * (`PN…`) nếu tạo từ form, nên ĐỪNG ràng buộc hình dạng mã ở bất cứ đâu trong luồng này.
 */

/**
 * Trần ảnh cho đường đính HÀNG LOẠT — cố ý **thấp hơn** `MAX_IMAGES_PER_IMPORT = 5` của server
 * (`stockImports.schemas.ts`). Đính thủ công ở trang chi tiết vẫn 5 ảnh; ở đây 2 là đủ (hoá đơn +
 * phiếu giao) và giữ quy ước đặt tên chỉ còn đúng hai dạng. Đừng "thống nhất" hai con số này làm một.
 */
export const MAX_BULK_IMAGES_PER_SLIP = 2;

/**
 * Ghép một file ảnh với mã phiếu theo TÊN FILE: `HD001.jpg` là ảnh thứ nhất của phiếu `HD001`,
 * `HD001-2.jpg` là ảnh thứ hai.
 *
 * Khớp theo mã **DÀI NHẤT** mà tên file bắt đầu bằng, rồi phần dư phải rỗng hoặc đúng `-<số>`. Phần
 * "dài nhất" là thứ chặn trường hợp một mã là tiền tố của mã khác (`HD1` và `HD10`), rất dễ xảy ra
 * với mã người dùng tự đánh số.
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
