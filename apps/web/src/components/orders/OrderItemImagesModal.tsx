"use client";

import { Modal } from "@/components/ui/Modal";
import {
  useDeleteSalesOrderItemImage,
  useSalesOrderItemImages,
  useUploadSalesOrderItemImages,
} from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { compressImage } from "@/lib/imageCompress";
import type { SalesOrderItem } from "@/types";
import { Trash2 } from "lucide-react";
import { useState } from "react";

/** Khớp MAX_IMAGES_PER_ORDER_ITEM ở server (salesOrders.schemas.ts). */
const MAX_ORDER_ITEM_IMAGES = 5;

interface OrderItemImagesModalProps {
  orderId: string;
  item: SalesOrderItem;
  /** ORDERS.APPROVE và đơn đã hoàn thành thì đính thêm / xoá được ảnh. */
  canManage: boolean;
  onClose: () => void;
}

/**
 * Ảnh chứng từ của MỘT dòng hàng. Dòng hàng hiện dạng hàng trong bảng nên gói vào modal mở từ nút ở
 * cột "Chứng từ", thay vì một card cố định như ExpenseProposalImagesCard. URL ký có hạn chỉ tải khi mở.
 */
export function OrderItemImagesModal({ orderId, item, canManage, onClose }: OrderItemImagesModalProps) {
  const imageCount = item.imageCount;
  const { data: images = [], isLoading } = useSalesOrderItemImages(orderId, item.id, imageCount > 0);
  const upload = useUploadSalesOrderItemImages(orderId, item.id);
  const remove = useDeleteSalesOrderItemImage(orderId, item.id);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const room = MAX_ORDER_ITEM_IMAGES - imageCount;
    if (room <= 0) return setError(`Mỗi hàng hoá tối đa ${MAX_ORDER_ITEM_IMAGES} ảnh chứng từ`);
    setError(picked.length > room ? `Chỉ nhận thêm ${room} ảnh nữa (tối đa ${MAX_ORDER_ITEM_IMAGES})` : null);
    setUploading(true);
    try {
      const compressed = await Promise.all(picked.slice(0, room).map((file) => compressImage(file)));
      await upload.mutateAsync(compressed);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : "Tải ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  function handleDelete(imageId: string) {
    if (!window.confirm("Xoá ảnh chứng từ này?")) return;
    setError(null);
    remove.mutate(imageId, { onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá ảnh thất bại") });
  }

  return (
    <Modal title={`Chứng từ — ${item.product.name} (${imageCount}/${MAX_ORDER_ITEM_IMAGES})`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {imageCount === 0 && <p className="text-sm text-slate-500">Chưa có ảnh chứng từ.</p>}
        {isLoading && imageCount > 0 && <p className="text-sm text-slate-400">Đang tải ảnh...</p>}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <div key={image.id} className="relative">
                <a href={image.url} target="_blank" rel="noopener noreferrer" title="Mở ảnh cỡ đầy đủ ở tab mới">
                  {/* Ảnh trên R2 dùng URL ký có hạn nên để thẻ img thường, khỏi khai remotePatterns. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="Ảnh chứng từ" className="h-24 w-24 rounded border border-slate-200 object-cover" />
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(image.id)}
                    className="absolute -right-1 -top-1 rounded-full bg-white p-1 text-slate-400 shadow hover:text-red-600"
                    title="Xoá ảnh"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canManage && (
          <div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePickFiles}
              disabled={uploading || imageCount >= MAX_ORDER_ITEM_IMAGES}
              className="text-sm"
            />
            {uploading && <p className="mt-1 text-xs text-slate-400">Đang nén và tải ảnh...</p>}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
