"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAdvanceExpenseProposal } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { useState } from "react";

interface ExpenseAdvanceModalProps {
  proposalId: string;
  code: string;
  /** Lần đầu thì điền sẵn số người lập đề nghị; tạm ứng thêm thì để trống. */
  initialAmount: number | null;
  /** Tổng dự kiến − tổng đã ứng. Server vẫn là nơi chốt trần, đây chỉ để báo sớm. */
  remaining: number;
  isFirst: boolean;
  onClose: () => void;
}

export function ExpenseAdvanceModal({ proposalId, code, initialAmount, remaining, isFirst, onClose }: ExpenseAdvanceModalProps) {
  const advance = useAdvanceExpenseProposal(proposalId);
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const value = amount.trim() === "" ? null : Number(amount);

  function handleSubmit() {
    setError(null);
    if (value === null || !(value > 0)) return setError("Số tiền tạm ứng phải lớn hơn 0.");
    if (value > remaining) return setError(`Tổng tạm ứng không được vượt tổng dự kiến — còn được ứng ${formatCurrency(remaining)}.`);
    advance.mutate(
      { amount: value, note: note.trim() || undefined },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof ApiError ? err.message : "Tạm ứng thất bại"),
      },
    );
  }

  return (
    <Modal title={`${isFirst ? "Tạm ứng" : "Tạm ứng thêm"} — phiếu ${code}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Còn được ứng: <span className="font-semibold text-slate-800">{formatCurrency(remaining)}</span>
        </p>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-600">Số tiền tạm ứng</label>
          <Input type="number" min="0" step="any" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
          {isFirst && initialAmount != null && (
            <span className="text-xs text-slate-400">Điền sẵn số người lập đề nghị ({formatCurrency(initialAmount)}) — sửa nếu ứng khác.</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-600">Ghi chú</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={advance.isPending}>
            {advance.isPending ? "Đang lưu..." : "Xác nhận tạm ứng"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
