"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useCompleteExpenseProposal, useUploadExpenseProposalImages } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { MAX_PROPOSAL_IMAGES, todayForDateInput } from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import type { ExpenseProposal } from "@/types";
import { Copy, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ExpenseItemsEditor, blankRow, rowsFromItems, totalsOf, validateRows, type ItemRow } from "./ExpenseItemsEditor";

interface ExpenseCompleteModalProps {
  proposal: ExpenseProposal;
  onClose: () => void;
  /** Phiếu đã hoàn thành nhưng tải ảnh lỗi — báo ra trang để người dùng đính lại ở mục Chứng từ. */
  onImageError: (message: string) => void;
}

const isRowEmpty = (row: ItemRow) => [row.content, row.unitPrice, row.unit, row.quantity, row.note].every((v) => v.trim() === "");

/**
 * Hoàn thành phiếu: khai hạng mục thực chi (có thể sao chép từ dự kiến rồi sửa), ngày nộp hoá đơn,
 * và ảnh chứng từ không bắt buộc. Thực chi vượt tổng dự kiến thì khoá nút — phải duyệt bổ sung trước.
 */
export function ExpenseCompleteModal({ proposal, onClose, onImageError }: ExpenseCompleteModalProps) {
  const complete = useCompleteExpenseProposal(proposal.id);
  const uploadImages = useUploadExpenseProposalImages(proposal.id);
  const [rows, setRows] = useState<ItemRow[]>(() => [blankRow()]);
  const [invoiceDate, setInvoiceDate] = useState(() =>
    proposal.invoiceDueDate ? toDateInput(proposal.invoiceDueDate) : todayForDateInput(),
  );
  // Ảnh mới chọn, chưa gửi lên. URL xem trước phải tự thu hồi, không thì rò bộ nhớ.
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      for (const item of pendingFiles) URL.revokeObjectURL(item.previewUrl);
    };
  }, [pendingFiles]);

  const { total } = totalsOf(rows);
  const budget = Number(proposal.totalAmount);
  const overBudget = total > budget;
  const busy = complete.isPending || uploading;

  function copyEstimated() {
    const hasInput = rows.some((row) => !isRowEmpty(row));
    if (hasInput && !window.confirm("Thay bảng thực chi đang nhập bằng hạng mục chi dự kiến?")) return;
    setRows(rowsFromItems(proposal.items));
  }

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const room = MAX_PROPOSAL_IMAGES - pendingFiles.length;
    if (room <= 0) return setError(`Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ`);
    setError(picked.length > room ? `Chỉ nhận thêm ${room} ảnh nữa (tối đa ${MAX_PROPOSAL_IMAGES})` : null);
    setPendingFiles((prev) => [...prev, ...picked.slice(0, room).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removePendingFile(previewUrl: string) {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(previewUrl);
      return prev.filter((item) => item.previewUrl !== previewUrl);
    });
  }

  async function handleSubmit() {
    setError(null);
    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);
    if (!invoiceDate) return setError("Vui lòng chọn ngày nộp hoá đơn.");
    if (overBudget) return setError("Chi vượt dự kiến — hãy thêm hạng mục chi dự kiến để người duyệt duyệt trước.");

    try {
      await complete.mutateAsync({ items: checked.items, invoiceDate });
    } catch (err) {
      return setError(err instanceof ApiError ? err.message : "Hoàn thành phiếu thất bại");
    }

    // Phiếu đã hoàn thành rồi — ảnh lỗi thì vẫn đóng dialog và báo ra trang, không để người dùng
    // tưởng cả phiếu chưa lưu mà bấm lại.
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        const images = await Promise.all(pendingFiles.map((item) => compressImage(item.file)));
        await uploadImages.mutateAsync(images);
      } catch (err) {
        const reason = err instanceof ApiError || err instanceof Error ? err.message : "lỗi không rõ";
        onImageError(`Phiếu đã hoàn thành nhưng tải ảnh chứng từ lỗi: ${reason}. Có thể đính lại ở mục Chứng từ.`);
      } finally {
        setUploading(false);
      }
    }
    onClose();
  }

  return (
    <Modal title={`Hoàn thành phiếu ${proposal.code}`} onClose={busy ? () => undefined : onClose} size="xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Hạng mục chi thực tế</h3>
          <Button type="button" variant="secondary" size="sm" onClick={copyEstimated} disabled={busy}>
            <Copy size={14} />
            Sao chép hạng mục chi dự kiến
          </Button>
        </div>
        <ExpenseItemsEditor rows={rows} onChange={setRows} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={`flex flex-col gap-1 rounded-lg px-3 py-2 ${overBudget ? "bg-red-50" : "bg-slate-50"}`}>
            <span className="text-sm text-slate-500">Tổng tiền đã chi</span>
            <span className={`text-lg font-semibold ${overBudget ? "text-red-700" : "text-slate-800"}`}>{formatCurrency(total)}</span>
            <span className="text-xs text-slate-500">Tổng dự kiến đã duyệt: {formatCurrency(budget)}</span>
            {overBudget && (
              <span className="text-xs font-medium text-red-700">
                Vượt dự kiến {formatCurrency(total - budget)} — hãy dùng &quot;Thêm hạng mục chi dự kiến&quot; để duyệt bổ sung trước.
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Ngày nộp hoá đơn</label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Chứng từ ({pendingFiles.length}/{MAX_PROPOSAL_IMAGES}) <span className="font-normal text-slate-400">— không bắt buộc</span>
          </label>
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((item) => (
                <div key={item.previewUrl} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt="Ảnh chứng từ sắp tải lên" className="h-20 w-20 rounded border border-dashed border-indigo-300 object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingFile(item.previewUrl)}
                    className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-slate-400 shadow hover:text-red-600"
                    title="Bỏ ảnh"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handlePickFiles}
            disabled={busy || pendingFiles.length >= MAX_PROPOSAL_IMAGES}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">Ảnh được nén trước khi gửi nên chụp bằng điện thoại thoải mái.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy || overBudget}>
            {complete.isPending ? "Đang lưu..." : uploading ? "Đang tải ảnh..." : "Hoàn thành"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
