/**
 * Chuẩn hoá tên món để tra ánh xạ: bỏ dấu, hạ chữ thường, gộp khoảng trắng, bỏ ký tự không phải chữ
 * hoặc số. Nhờ vậy "Trà Vải  (L)" và "tra vai (l)" cùng trỏ về một khoá.
 *
 * Đây là khoá tra cứu duy nhất, nên ĐỔI HÀM NÀY LÀ LÀM MỌI ÁNH XẠ ĐÃ LƯU TRỎ SAI. Muốn đổi cách chuẩn
 * hoá thì phải viết migration tính lại cột `posName` cho toàn bộ bảng.
 */
export function normalizePosName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // đ/Đ không phải là d + dấu nên NFD không tách ra được
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

/**
 * Điểm giống nhau giữa tên POS và tên món trong danh mục, 0…1.
 *
 * Dùng tỉ lệ token trùng trên tổng token của tên NGẮN hơn, cộng thưởng khi một tên chứa trọn tên kia.
 * Cố ý không dùng Levenshtein: tên POS hay thêm size và biến thể ("Trà vải nhiệt đới (L)") nên khác
 * biệt nằm ở SỐ TỪ thừa chứ không ở vài ký tự sai, mà khoảng cách ký tự thì phạt rất nặng từ thừa.
 *
 * Đây chỉ là gợi ý để người bấm nhanh hơn — người vẫn xác nhận từng dòng, nên gợi ý sai không làm
 * hỏng dữ liệu.
 */
export function similarityScore(posNormalized: string, itemNormalized: string): number {
  if (!posNormalized || !itemNormalized) return 0;
  if (posNormalized === itemNormalized) return 1;

  const posTokens = tokens(posNormalized);
  const itemTokens = tokens(itemNormalized);
  if (posTokens.length === 0 || itemTokens.length === 0) return 0;

  const itemSet = new Set(itemTokens);
  const shared = posTokens.filter((t) => itemSet.has(t)).length;
  const base = shared / Math.min(posTokens.length, itemTokens.length);

  const contains = posNormalized.includes(itemNormalized) || itemNormalized.includes(posNormalized);
  return Math.min(1, contains ? base * 0.8 + 0.2 : base);
}

export interface MappingSuggestion {
  finishedGoodItemId: string;
  code: string;
  name: string;
  score: number;
}

/** Gợi ý tối đa `limit` món gần nhất, chỉ trả về thứ đạt ngưỡng để danh sách không toàn rác. */
export function suggestFinishedGoods(
  posNameRaw: string,
  items: { id: string; code: string; name: string }[],
  limit = 3,
  minScore = 0.34,
): MappingSuggestion[] {
  const posNormalized = normalizePosName(posNameRaw);
  return items
    .map((item) => ({
      finishedGoodItemId: item.id,
      code: item.code,
      name: item.name,
      score: similarityScore(posNormalized, normalizePosName(item.name)),
    }))
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
