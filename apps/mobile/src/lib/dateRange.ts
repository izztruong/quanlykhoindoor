const MAX_RANGE_MONTHS = 3;

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Keeps a from/to date pair within a 3-month span. Call this from whichever
 * input just changed, passing which field that was, so the *other* field
 * gets pulled back into range instead of the one the user is actively
 * editing (e.g. moving "from" forward drags "to" along with it).
 */
export function clampDateRange(from: string, to: string, changed: "from" | "to"): { from: string; to: string } {
  if (!from || !to) return { from, to };
  if (from > to) return { from, to };

  const maxTo = addMonths(from, MAX_RANGE_MONTHS);
  if (to <= maxTo) return { from, to };

  if (changed === "from") {
    return { from, to: maxTo };
  }
  return { from: addMonths(to, -MAX_RANGE_MONTHS), to };
}

function formatDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Current local time formatted for an `<input type="datetime-local">` default value. */
export function nowForDatetimeLocal(): string {
  return formatDatetimeLocal(new Date());
}

/**
 * Mốc thời gian từ API (ISO, múi UTC) -> giá trị cho `<input type="datetime-local">`, vốn luôn
 * hiểu theo GIỜ ĐỊA PHƯƠNG.
 *
 * Không được cắt chuỗi kiểu `iso.slice(0, 16)`: làm vậy là lấy giờ UTC rồi nhét vào ô hiểu theo
 * giờ địa phương, nên vừa hiển thị sai vừa TRỪ ĐI phần lệch múi giờ mỗi lần bấm lưu (giờ VN là
 * -7 tiếng/lần). Với các mốc dùng làm ranh giới kỳ Check Cost thì đó là sai lệch số liệu thật.
 */
export function toDatetimeLocal(iso: string): string {
  return formatDatetimeLocal(new Date(iso));
}
