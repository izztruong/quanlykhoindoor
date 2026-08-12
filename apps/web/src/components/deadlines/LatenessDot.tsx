import { formatDateTime } from "@/lib/format";

interface Props {
  /** Hạn của kỳ, chốt lúc tạo bản ghi. null = chưa được đánh giá. */
  dueAt?: string | null;
  isLate?: boolean;
  /** Thời điểm nộp thật (createdAt) — chỉ dùng cho phần chú thích khi rê chuột. */
  submittedAt: string;
}

/**
 * Ba trạng thái chứ không phải hai: bản ghi tạo trước khi có chức năng này (hoặc lúc chưa cấu
 * hình lịch) KHÔNG có hạn để so, nên phải là chấm xám "chưa đánh giá". Gộp chúng thành xanh sẽ
 * khiến toàn bộ lịch sử cũ trông như đúng hạn hết.
 */
export function LatenessDot({ dueAt, isLate, submittedAt }: Props) {
  if (!dueAt) {
    return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" title="Chưa đánh giá (không có hạn để so)" />;
  }

  const tone = isLate ? "bg-red-500" : "bg-emerald-500";
  const label = isLate ? "Muộn" : "Đúng hạn";
  return (
    <span className={`inline-block h-2.5 w-2.5 rounded-full ${tone}`} title={`${label} — hạn ${formatDateTime(dueAt)}, nộp ${formatDateTime(submittedAt)}`} />
  );
}
