"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCreateShiftExpense, useUpdateShiftExpense, type ShiftExpenseInput } from "@/hooks/useShiftExpenses";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, toDateInput } from "@/lib/format";
import type { ShiftExpense } from "@/types";
import { useState } from "react";

interface ShiftExpenseFormModalProps {
  /** Có thì là sửa, không có thì là thêm mới. */
  existing?: ShiftExpense;
  onClose: () => void;
}

/** Hôm nay dạng "YYYY-MM-DD" theo giờ máy — ô ngày mặc định khi thêm mới. */
function todayForDateInput() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function ShiftExpenseFormModal({ existing, onClose }: ShiftExpenseFormModalProps) {
  const isEdit = Boolean(existing);
  const [spentAt, setSpentAt] = useState(existing ? toDateInput(existing.spentAt) : todayForDateInput());
  const [content, setContent] = useState(existing?.content ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [quantity, setQuantity] = useState(existing ? String(Number(existing.quantity)) : "");
  const [unitPrice, setUnitPrice] = useState(existing ? String(Number(existing.unitPrice)) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const createExpense = useCreateShiftExpense();
  const updateExpense = useUpdateShiftExpense(existing?.id ?? "");
  const isPending = createExpense.isPending || updateExpense.isPending;

  // Chỉ để người nhập nhìn cho yên tâm — số chốt vẫn do server tính lại khi lưu.
  const previewAmount = Number(quantity) * Number(unitPrice);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError("Nội dung chi không được để trống");
      return;
    }
    if (!spentAt) {
      setError("Chưa chọn ngày chi");
      return;
    }
    if (!(Number(quantity) > 0)) {
      setError("Số lượng phải lớn hơn 0");
      return;
    }
    if (!(Number(unitPrice) >= 0)) {
      setError("Đơn giá không hợp lệ");
      return;
    }

    const payload: ShiftExpenseInput = {
      spentAt,
      content: content.trim(),
      unit: unit.trim() || undefined,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      note: note.trim() || undefined,
    };

    const mutation = isEdit ? updateExpense : createExpense;
    mutation.mutate(payload, {
      onSuccess: () => onClose(),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu khoản chi thất bại"),
    });
  }

  return (
    <Modal title={isEdit ? "Sửa khoản chi" : "Thêm khoản chi"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Ngày *</label>
          <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nội dung chi *</label>
          <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Đá, Cam, Ship sữa dừa sang Xuân La" />
        </div>
        <div className="flex gap-3">
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đơn vị tính</label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="túi, kg, lần..." />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-slate-500">Số lượng *</label>
            <Input type="number" step="0.001" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đơn giá *</label>
            <Input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Ghi chú</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">Thành tiền</span>
          <span className="font-semibold text-slate-800">
            {Number.isFinite(previewAmount) && previewAmount > 0 ? formatCurrency(previewAmount) : "-"}
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Thêm khoản chi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
