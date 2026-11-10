"use client";

import type { MaterialWasteImage } from "@/types";
import { Trash2 } from "lucide-react";

/** Khớp MAX_IMAGES_PER_WASTE ở server — server vẫn là nơi chốt, đây chỉ để báo sớm. */
export const MAX_WASTE_IMAGES = 5;

export interface PendingWasteImage {
  file: File;
  previewUrl: string;
}

interface MaterialWasteImagePickerProps {
  /** Ảnh đã lưu trên server (chỉ có khi sửa phiếu). */
  savedImages: MaterialWasteImage[];
  /** Ảnh vừa chọn, chưa gửi — form giữ state này vì phải gửi SAU khi phiếu đã có id. */
  pendingImages: PendingWasteImage[];
  onPick: (files: File[]) => void;
  onRemovePending: (previewUrl: string) => void;
  /** Bỏ trống = không hiện nút xoá ảnh đã lưu (thiếu quyền sửa). */
  onDeleteSaved?: (imageId: string) => void;
}

/** Khối "Ảnh chứng minh" của form phiếu huỷ — cùng giao diện với ảnh chứng từ khoản chi ngoài. */
export function MaterialWasteImagePicker({
  savedImages,
  pendingImages,
  onPick,
  onRemovePending,
  onDeleteSaved,
}: MaterialWasteImagePickerProps) {
  const total = savedImages.length + pendingImages.length;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">
        Ảnh chứng minh ({total}/{MAX_WASTE_IMAGES})
      </label>

      {total > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {savedImages.map((image) => (
            <div key={image.id} className="relative">
              {/* Ảnh trên R2 dùng URL ký có hạn nên để thẻ img thường, khỏi khai remotePatterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="Ảnh chứng minh" className="h-20 w-20 rounded border border-slate-200 object-cover" />
              {onDeleteSaved && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Xoá ảnh này?")) onDeleteSaved(image.id);
                  }}
                  className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-slate-400 shadow hover:text-red-600"
                  title="Xoá ảnh"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}

          {pendingImages.map((item) => (
            <div key={item.previewUrl} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt="Ảnh sắp tải lên"
                className="h-20 w-20 rounded border border-dashed border-indigo-300 object-cover"
              />
              <button
                type="button"
                onClick={() => onRemovePending(item.previewUrl)}
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
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length > 0) onPick(picked);
        }}
        disabled={total >= MAX_WASTE_IMAGES}
        className="text-sm"
      />
      <p className="mt-1 text-xs text-slate-400">Không bắt buộc. Ảnh được nén trước khi gửi nên chụp bằng điện thoại thoải mái.</p>
    </div>
  );
}
