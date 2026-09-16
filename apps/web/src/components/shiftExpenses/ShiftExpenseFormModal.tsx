"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import {
  useCreateShiftExpense,
  useDeleteShiftExpenseImage,
  useShiftExpenseImages,
  useUpdateShiftExpense,
  useUploadShiftExpenseImages,
  type ShiftExpenseInput,
} from "@/hooks/useShiftExpenses";
import { ApiError } from "@/lib/api-client";
import { SHIFT_EXPENSE_TYPE_OPTIONS, formatCurrency, toDateInput } from "@/lib/format";
import { compressImage } from "@/lib/imageCompress";
import type { ShiftExpense, ShiftExpenseType } from "@/types";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Khớp với MAX_IMAGES_PER_EXPENSE ở server — server vẫn là nơi chốt, đây chỉ để báo sớm. */
const MAX_IMAGES = 5;

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
  // Phần lớn khoản chi là nguyên vật liệu nên mặc định NVL, vẫn phải gửi tường minh lên server.
  const [type, setType] = useState<ShiftExpenseType>(existing?.type ?? "MATERIAL");
  const [content, setContent] = useState(existing?.content ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [quantity, setQuantity] = useState(existing ? String(Number(existing.quantity)) : "");
  const [unitPrice, setUnitPrice] = useState(existing ? String(Number(existing.unitPrice)) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  // Ảnh mới chọn, chưa gửi lên. URL xem trước phải tự thu hồi, không thì rò bộ nhớ.
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // Id của bản ghi đã nằm trong DB. Với form thêm mới, nó được điền sau lần lưu đầu tiên — nhờ đó
  // bấm Lưu lại sau khi đính ảnh hỏng sẽ SỬA bản ghi vừa tạo chứ không tạo thêm bản ghi trùng.
  const [savedId, setSavedId] = useState<string | null>(existing?.id ?? null);

  const createExpense = useCreateShiftExpense();
  const updateExpense = useUpdateShiftExpense();
  const uploadImages = useUploadShiftExpenseImages();
  const deleteImage = useDeleteShiftExpenseImage(existing?.id ?? "");
  const { data: savedImages = [] } = useShiftExpenseImages(existing?.id ?? "");
  const isPending = createExpense.isPending || updateExpense.isPending || uploading;

  useEffect(() => {
    return () => {
      for (const item of pendingFiles) URL.revokeObjectURL(item.previewUrl);
    };
  }, [pendingFiles]);

  const totalImages = savedImages.length + pendingFiles.length;

  function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    const room = MAX_IMAGES - totalImages;
    if (room <= 0) {
      setError(`Mỗi khoản chi tối đa ${MAX_IMAGES} ảnh`);
      return;
    }

    setError(picked.length > room ? `Chỉ nhận thêm ${room} ảnh nữa (tối đa ${MAX_IMAGES})` : null);
    setPendingFiles((prev) => [
      ...prev,
      ...picked.slice(0, room).map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function removePendingFile(previewUrl: string) {
    setPendingFiles((prev) => {
      const next = prev.filter((item) => item.previewUrl !== previewUrl);
      URL.revokeObjectURL(previewUrl);
      return next;
    });
  }

  /**
   * Gửi ảnh sau khi đã có id khoản chi. Trả về câu lỗi nếu hỏng, `null` nếu xong — cố ý KHÔNG ném:
   * khoản chi đã lưu rồi, người dùng cần biết điều đó thay vì tưởng mất trắng.
   */
  async function uploadPendingImages(expenseId: string): Promise<string | null> {
    if (pendingFiles.length === 0) return null;

    try {
      const images = await Promise.all(pendingFiles.map((item) => compressImage(item.file)));
      await uploadImages.mutateAsync({ id: expenseId, images });
      return null;
    } catch (err) {
      if (err instanceof ApiError) return err.message;
      return err instanceof Error ? err.message : "Tải ảnh thất bại";
    }
  }

  // Chỉ để người nhập nhìn cho yên tâm — số chốt vẫn do server tính lại khi lưu.
  const previewAmount = Number(quantity) * Number(unitPrice);

  async function handleSubmit(e: React.FormEvent) {
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
      type,
      content: content.trim(),
      unit: unit.trim() || undefined,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      note: note.trim() || undefined,
    };

    // Hai bước, vì khoản chi mới chưa có id cho tới khi server trả về: lưu bản ghi trước, lấy id,
    // rồi mới đẩy ảnh lên. Bước hai hỏng cũng không được nuốt mất bước một.
    let expenseId: string;
    try {
      const saved = savedId
        ? await updateExpense.mutateAsync({ id: savedId, data: payload })
        : await createExpense.mutateAsync(payload);
      expenseId = saved.id;
      setSavedId(saved.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu khoản chi thất bại");
      return;
    }

    setUploading(true);
    const uploadError = await uploadPendingImages(expenseId);
    setUploading(false);

    if (uploadError) {
      setError(`Đã lưu khoản chi nhưng tải ảnh thất bại: ${uploadError}`);
      // Không đóng modal: ảnh vẫn còn trong danh sách chờ để bấm lưu lại, và khoản chi thì đã an toàn.
      return;
    }

    onClose();
  }

  return (
    <Modal title={isEdit ? "Sửa khoản chi" : "Thêm khoản chi"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Ngày *</label>
            <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Loại chi *</label>
            <Select value={type} onChange={(e) => setType(e.target.value as ShiftExpenseType)}>
              {SHIFT_EXPENSE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
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

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Ảnh chứng từ ({totalImages}/{MAX_IMAGES})
          </label>

          {(savedImages.length > 0 || pendingFiles.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-2">
              {savedImages.map((image) => (
                <div key={image.id} className="relative">
                  {/* Ảnh trên R2 dùng URL ký có hạn nên để thẻ img thường, khỏi khai remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="Ảnh chứng từ" className="h-20 w-20 rounded border border-slate-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Xoá ảnh này?")) return;
                      deleteImage.mutate(image.id);
                    }}
                    className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-slate-400 shadow hover:text-red-600"
                    title="Xoá ảnh"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {pendingFiles.map((item) => (
                <div key={item.previewUrl} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt="Ảnh sắp tải lên"
                    className="h-20 w-20 rounded border border-dashed border-indigo-300 object-cover"
                  />
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
            disabled={totalImages >= MAX_IMAGES}
            className="text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">Ảnh được nén trước khi gửi nên chụp bằng điện thoại thoải mái.</p>
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
            {uploading ? "Đang tải ảnh..." : isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Thêm khoản chi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
