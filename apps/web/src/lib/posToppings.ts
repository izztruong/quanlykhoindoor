/**
 * Tách TOPPING GỌI THÊM ra khỏi tên món do POS xuất.
 *
 * POS nhồi topping vào chính tên món: `Non ngàn (Kem Mặn (1))`. Không tách thì mỗi tổ hợp
 * (món × topping × số lượng) là một tên POS mới phải khai tay ở `PosItemMapping`, và mỗi tên lạ
 * CHẶN toàn bộ lần nhập (`importPosSales` trả `written: 0`). Số tên chỉ tăng, không bao giờ hội tụ.
 *
 * **Luật nhận dạng cố ý HẸP**: chỉ coi nhóm ngoặc ở CUỐI tên là topping khi mỗi mục bên trong kết
 * thúc bằng `(<số>)`. Tên món thật có size trong ngoặc — `Bạc Xỉu (L)`, `Trà vải nhiệt đới (L)` —
 * và `normalizePosName` ở server giữ `(L)` làm phần của khoá ánh xạ, nên luật "bóc mọi ngoặc" sẽ
 * làm mọi ánh xạ đã lưu trỏ sai. Không nhận ra được thì trả nguyên văn, để tên đó vào
 * `unmappedNames` cho người xử lý — thà bắt khai tay còn hơn đoán sai im lặng.
 *
 * File này CỐ Ý không import gì (kể cả alias `@/`) để chạy trực tiếp được bằng `node` khi kiểm
 * chứng — repo không có test framework.
 */

export interface PosTopping {
  name: string;
  quantity: number;
}

export interface SplitPosName {
  /** Tên món sau khi đã bóc hết khối topping ở cuối. */
  base: string;
  /** Rỗng = không nhận ra khối topping nào; lúc đó `base` là tên nguyên văn. */
  toppings: PosTopping[];
}

/**
 * Số lượng topping trong ngoặc. Theo quy ước số của repo (`lib/excelParse.ts` → `parseNumber`):
 * dấu chấm LÀ thập phân, dấu phẩy cũng được nhận, không có phân cách nghìn.
 * Trả `null` khi không phải một số dương — khi đó mục đó không được coi là topping.
 */
function parseToppingQuantity(raw: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return null;
  const value = Number(raw.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Vị trí dấu `(` mở nhóm ngoặc TOP-LEVEL đóng ở đúng ký tự cuối chuỗi; `null` nếu chuỗi không kết
 * thúc bằng một nhóm ngoặc cân đối.
 *
 * Quét từ phải sang trái theo độ sâu thay vì dùng regex: nhóm topping tự chứa ngoặc lồng
 * (`(Kem Mặn (1))`) và tên topping còn có thể mang size (`(Kem Mặn (L) (1))`), mà regex không đếm
 * được độ sâu.
 */
function findTrailingGroupStart(text: string): number | null {
  if (!text.endsWith(")")) return null;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];
    if (char === ")") depth += 1;
    else if (char === "(") {
      depth -= 1;
      if (depth === 0) return i;
      if (depth < 0) return null; // ngoặc lệch — không đoán
    }
  }
  return null;
}

/** Cắt nội dung nhóm ngoặc theo dấu phẩy Ở ĐỘ SÂU 0, để `(T1 (1), T2 (2))` ra hai mục. */
function splitTopLevelCommas(content: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of content) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * Đọc một mục trong nhóm ngoặc thành `{ name, quantity }`.
 * `"Kem Mặn (1)"` → `{ name: "Kem Mặn", quantity: 1 }`; `"Kem Mặn (L) (1)"` → tên giữ cả `(L)`.
 * Không có `(<số>)` ở cuối (vd `"L"`) → `null`, tức đây không phải khối topping.
 */
function parseToppingEntry(entry: string): PosTopping | null {
  const start = findTrailingGroupStart(entry);
  if (start === null || start === 0) return null; // `(1)` trần, không có tên topping
  const quantity = parseToppingQuantity(entry.slice(start + 1, -1).trim());
  if (quantity === null) return null;
  const name = entry.slice(0, start).trim();
  return name ? { name, quantity } : null;
}

/**
 * Bóc hết các khối topping ở cuối tên món.
 *
 * `base` rỗng sau khi bóc (tên chỉ gồm khối topping) thì KHÔNG tách: trả nguyên văn để tên đó hiện
 * ra trong `unmappedNames`, chứ không ném mất một dòng doanh số.
 */
export function splitPosNameToppings(raw: string): SplitPosName {
  const original = raw.trim();
  let base = original;
  const toppings: PosTopping[] = [];

  // Lặp vì POS có thể in nhiều khối liền nhau: `Món (T1 (1)) (T2 (2))`.
  for (;;) {
    const start = findTrailingGroupStart(base);
    if (start === null || start === 0) break;

    const entries = splitTopLevelCommas(base.slice(start + 1, -1));
    if (entries.length === 0) break;

    const parsed = entries.map(parseToppingEntry);
    // Cả nhóm phải là topping. Một mục không khớp (vd `(L)`) là nhóm đó không phải khối topping.
    if (parsed.some((p) => p === null)) break;

    const nextBase = base.slice(0, start).trim();
    if (!nextBase) break;

    base = nextBase;
    // Khối ngoài cùng được bóc trước, nên chèn lên đầu để giữ đúng thứ tự như trên file.
    toppings.unshift(...(parsed as PosTopping[]));
  }

  if (toppings.length === 0) return { base: original, toppings: [] };
  return { base, toppings };
}
