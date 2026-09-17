/**
 * Đổi qua lại giữa ngày thuần "YYYY-MM-DD" (cột DATE ở server, tham số ?from=&to=) và Date cho ô chọn
 * ngày. Luôn theo giờ máy, không bao giờ qua toISOString().slice(0,10) — cách đó lấy ngày UTC nên
 * ở giờ Việt Nam trước 7h sáng sẽ ra ngày hôm qua.
 */
export function dateOnlyToDate(value: string): Date {
  // Ghép giờ trưa để đổi qua lại không bị lệch ngày ở rìa múi giờ.
  return new Date(`${value}T12:00:00`);
}

export function dateToDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
