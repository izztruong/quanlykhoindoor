import { formatDateVN } from "./format";

/**
 * "vừa xong", "5 phút trước", "3 giờ trước" — quá một ngày thì về dạng ngày giờ đầy đủ, vì "27 ngày
 * trước" khó đối chiếu với phiếu hơn là một ngày cụ thể.
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diffMinutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return formatDateVN(iso);
}
