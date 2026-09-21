"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useReviseExpenseProposal } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { ExpenseProposal } from "@/types";
import { useState } from "react";
import { ExpenseItemsEditor, rowsFromItems, totalsOf, validateRows, type ItemRow } from "./ExpenseItemsEditor";

interface ExpenseRevisionModalProps {
  proposal: ExpenseProposal;
  /** Tổng đã tạm ứng — tổng dự kiến mới không được nhỏ hơn số này. */
  advanced: number;
  onClose: () => void;
}

/** Sửa cả bảng hạng mục chi dự kiến rồi gửi người duyệt duyệt bổ sung. Bảng cũ giữ nguyên tới khi được duyệt. */
export function ExpenseRevisionModal({ proposal, advanced, onClose }: ExpenseRevisionModalProps) {
  const revise = useReviseExpenseProposal(proposal.id);
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromItems(proposal.items));
  const [error, setError] = useState<string | null>(null);
  const { total } = totalsOf(rows);
  const currentTotal = Number(proposal.totalAmount);

  function handleSubmit() {
    setError(null);
    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);
    if (total < advanced) return setError(`Tổng dự kiến mới không được nhỏ hơn số đã tạm ứng (${formatCurrency(advanced)}).`);
    revise.mutate(checked.items, {
      onSuccess: onClose,
      onError: (err) => setError(err instanceof ApiError ? err.message : "Gửi duyệt bổ sung thất bại"),
    });
  }

  return (
    <Modal title={`Hạng mục chi dự kiến — phiếu ${proposal.code}`} onClose={onClose} size="xl">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Sửa, thêm hoặc xoá dòng. Bấm Lưu để gửi <span className="font-medium text-slate-700">{proposal.approver?.name ?? "người duyệt"}</span>{" "}
          duyệt bổ sung — bảng hiện tại vẫn giữ nguyên cho tới khi được duyệt.
        </p>
        <ExpenseItemsEditor rows={rows} onChange={setRows} />
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">
            Tổng hiện tại: <span className="font-medium text-slate-700">{formatCurrency(currentTotal)}</span>
          </span>
          <span className="text-slate-500">
            Tổng mới: <span className="font-semibold text-slate-800">{formatCurrency(total)}</span>
          </span>
          {advanced > 0 && (
            <span className="text-slate-500">
              Đã tạm ứng: <span className="font-medium text-slate-700">{formatCurrency(advanced)}</span>
            </span>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={revise.isPending}>
            {revise.isPending ? "Đang gửi..." : "Lưu & gửi duyệt"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
