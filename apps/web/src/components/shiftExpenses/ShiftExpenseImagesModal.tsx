"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useShiftExpenseImages } from "@/hooks/useShiftExpenses";
import { ApiError } from "@/lib/api-client";

interface ShiftExpenseImagesModalProps {
  expenseId: string;
  title: string;
  onClose: () => void;
}

/** Chỉ để xem. Thêm/xoá ảnh làm trong form sửa khoản chi. */
export function ShiftExpenseImagesModal({ expenseId, title, onClose }: ShiftExpenseImagesModalProps) {
  const { data: images = [], isLoading, error } = useShiftExpenseImages(expenseId);

  return (
    <Modal title={`Ảnh chứng từ — ${title}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {isLoading && <p className="text-sm text-slate-400">Đang tải ảnh...</p>}
        {error && (
          <p className="text-sm text-red-600">{error instanceof ApiError ? error.message : "Không tải được ảnh"}</p>
        )}
        {!isLoading && !error && images.length === 0 && <p className="text-sm text-slate-500">Khoản chi này chưa có ảnh.</p>}

        {images.map((image) => (
          <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer" className="block">
            {/* Ảnh nằm trên R2 sau URL ký có hạn, không phải tài nguyên tĩnh của web — dùng thẻ img
                thường thay vì next/image để khỏi khai remotePatterns cho một host có chữ ký đổi liên tục. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt="Ảnh chứng từ"
              className="w-full rounded-lg border border-slate-200 object-contain"
            />
          </a>
        ))}

        <p className="text-xs text-slate-400">Bấm vào ảnh để mở cỡ đầy đủ ở tab mới.</p>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
