"use client";

import { Badge } from "@/components/ui/Badge";
import { useToggleShiftExpensePaid } from "@/hooks/useShiftExpenses";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { ShiftExpense } from "@/types";
import { CheckCircle2, RotateCcw } from "lucide-react";

interface Props {
  expense: ShiftExpense;
  canPay: boolean;
  onError: (message: string | null) => void;
}

/**
 * Ô "Đã chi" của một dòng. Tách hẳn ra component thay vì viết thẳng trong `cell` của bảng vì mảng
 * cột bên trang nằm trong useMemo: mọi state giữ ở cấp trang (vd id dòng đang gửi) sẽ bị closure cũ
 * của cell đọc nhầm. Mỗi dòng tự giữ mutation của mình nên `toggle.isPending` chính là trạng thái
 * đang gửi của đúng dòng đó, và component tự render lại bất kể memo.
 */
export function ShiftExpensePaidCell({ expense, canPay, onError }: Props) {
  const toggle = useToggleShiftExpensePaid();
  const isPaid = Boolean(expense.paidAt);

  function run(paid: boolean) {
    // Chỉ hỏi ở chiều đánh dấu: đó là chiều khoá quán khỏi sửa/xoá. Gỡ dấu thì mở ra, bấm nhầm không hại.
    if (paid && !window.confirm(`Đánh dấu "${expense.content}" là ĐÃ CHI? Quán sẽ không sửa hay xoá khoản này được nữa.`)) {
      return;
    }
    onError(null);
    toggle.mutate(
      { id: expense.id, paid },
      { onError: (err) => onError(err instanceof ApiError ? err.message : "Không đổi được trạng thái đã chi") },
    );
  }

  if (isPaid) {
    return (
      <span className="flex items-center gap-1">
        <Badge tone="green" title={`${expense.paidBy?.name ?? "—"} · ${formatDateTime(expense.paidAt as string)}`}>
          Đã chi
        </Badge>
        {canPay && (
          <button
            type="button"
            onClick={() => run(false)}
            disabled={toggle.isPending}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            title="Bỏ đánh dấu đã chi"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </span>
    );
  }

  if (!canPay) return <Badge tone="gray">Chưa chi</Badge>;

  return (
    <button
      type="button"
      onClick={() => run(true)}
      disabled={toggle.isPending}
      className="flex items-center gap-1 text-indigo-600 hover:underline disabled:opacity-40 disabled:hover:no-underline"
      title="Đánh dấu khoản chi này là đã chi"
    >
      <CheckCircle2 size={14} />
      Đánh dấu
    </button>
  );
}
