"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAdvanceExpenseProposal, useUploadExpenseProposalImages } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { MAX_PROPOSAL_IMAGES } from "@/lib/expenseProposal";
import { formatCurrency } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface ExpenseAdvanceModalProps {
  proposalId: string;
  code: string;
  /** Lần đầu thì điền sẵn số người lập đề nghị; tạm ứng thêm thì để trống. */
  initialAmount: number | null;
  /** Tổng dự kiến − tổng đã ứng. Server vẫn là nơi chốt trần, đây chỉ để báo sớm. */
  remaining: number;
  isFirst: boolean;
  /** Số ảnh chứng từ phiếu đã có — trần ảnh tính chung cho cả phiếu. */
  existingImageCount: number;
  onClose: () => void;
  /** Đã tạm ứng nhưng tải ảnh lỗi — báo ra trang để người dùng đính lại ở mục Chứng từ. */
  onImageError: (message: string) => void;
}

export function ExpenseAdvanceModal({
  proposalId,
  code,
  initialAmount,
  remaining,
  isFirst,
  existingImageCount,
  onClose,
  onImageError,
}: ExpenseAdvanceModalProps) {
  const advance = useAdvanceExpenseProposal(proposalId);
  const uploadImages = useUploadExpenseProposalImages(proposalId);
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");
  const [note, setNote] = useState("");
  // Ảnh mới chọn, chưa gửi lên. URL xem trước phải tự thu hồi, không thì rò bộ nhớ.
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      for (const item of pendingFiles) URL.revokeObjectURL(item.previewUrl);
    };
  }, [pendingFiles]);

  const value = amount.trim() === "" ? null : Number(amount);
  const imageRoom = MAX_PROPOSAL_IMAGES - existingImageCount - pendingFiles.length;
  const busy = advance.isPending || uploading;

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    if (imageRoom <= 0) return setError(`Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ`);
    setError(picked.length > imageRoom ? `Chỉ nhận thêm ${imageRoom} ảnh nữa (tối đa ${MAX_PROPOSAL_IMAGES})` : null);
    setPendingFiles((prev) => [...prev, ...picked.slice(0, imageRoom).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removePendingFile(previewUrl: string) {
    setPendingFiles((prev) => {
      URL.revokeObjectURL(previewUrl);
      return prev.filter((item) => item.previewUrl !== previewUrl);
    });
  }

  async function handleSubmit() {
    setError(null);
    if (value === null || !(value > 0)) return setError("Số tiền tạm ứng phải lớn hơn 0.");
    if (value > remaining) return setError(`Tổng tạm ứng không được vượt tổng dự kiến — còn được ứng ${formatCurrency(remaining)}.`);

    try {
      await advance.mutateAsync({ amount: value, note: note.trim() || undefined });
    } catch (err) {
      return setError(err instanceof ApiError ? err.message : "Tạm ứng thất bại");
    }

    // Tạm ứng đã ghi rồi — ảnh lỗi thì vẫn đóng dialog và báo ra trang, không để người dùng tưởng
    // chưa ứng mà bấm lại (sẽ thành ứng hai lần).
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        const images = await Promise.all(pendingFiles.map((item) => compressImage(item.file)));
        await uploadImages.mutateAsync(images);
      } catch (err) {
        const reason = err instanceof ApiError || err instanceof Error ? err.message : "lỗi không rõ";
        onImageError(`Đã tạm ứng nhưng tải ảnh chứng từ lỗi: ${reason}. Có thể đính lại ở mục Chứng từ.`);
      } finally {
        setUploading(false);
      }
    }
    onClose();
  }

  return (
    <Modal title={`${isFirst ? "Tạm ứng" : "Tạm ứng thêm"} — phiếu ${code}`} onClose={busy ? () => undefined : onClose}>
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
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600">
            Chứng từ ({existingImageCount + pendingFiles.length}/{MAX_PROPOSAL_IMAGES}){" "}
            <span className="font-normal text-slate-400">— không bắt buộc</span>
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
          <input type="file" accept="image/*" multiple onChange={handlePickFiles} disabled={busy || imageRoom <= 0} className="text-sm" />
          <p className="mt-1 text-xs text-slate-400">Ảnh được nén trước khi gửi nên chụp bằng điện thoại thoải mái.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Huỷ
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy}>
            {advance.isPending ? "Đang lưu..." : uploading ? "Đang tải ảnh..." : "Xác nhận tạm ứng"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
