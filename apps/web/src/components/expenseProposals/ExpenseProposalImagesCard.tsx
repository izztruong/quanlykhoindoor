"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  useDeleteExpenseProposalImage,
  useExpenseProposalImages,
  useUploadExpenseProposalImages,
} from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { MAX_PROPOSAL_IMAGES } from "@/lib/expenseProposal";
import { compressImage } from "@/lib/imageCompress";
import { Trash2 } from "lucide-react";
import { useState } from "react";

interface ExpenseProposalImagesCardProps {
  proposalId: string;
  imageCount: number;
  /** Có quyền Hoàn thành thì đính thêm / xoá được ảnh. */
  canManage: boolean;
}

/** Ảnh chứng từ của phiếu đã hoàn thành. URL ký có hạn chỉ tải khi phiếu có ảnh hoặc người xem được quản lý. */
export function ExpenseProposalImagesCard({ proposalId, imageCount, canManage }: ExpenseProposalImagesCardProps) {
  const { data: images = [], isLoading } = useExpenseProposalImages(proposalId, imageCount > 0);
  const upload = useUploadExpenseProposalImages(proposalId);
  const remove = useDeleteExpenseProposalImage(proposalId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManage && imageCount === 0) return null;

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    const room = MAX_PROPOSAL_IMAGES - imageCount;
    if (room <= 0) return setError(`Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ`);
    setError(picked.length > room ? `Chỉ nhận thêm ${room} ảnh nữa (tối đa ${MAX_PROPOSAL_IMAGES})` : null);
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
    <Card>
      <CardHeader>
        <CardTitle>
          Chứng từ ({imageCount}/{MAX_PROPOSAL_IMAGES})
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
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
              disabled={uploading || imageCount >= MAX_PROPOSAL_IMAGES}
              className="text-sm"
            />
            {uploading && <p className="mt-1 text-xs text-slate-400">Đang nén và tải ảnh...</p>}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardBody>
    </Card>
  );
}
