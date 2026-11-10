"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useMaterialWasteImages } from "@/hooks/useMaterialWaste";

/** Ảnh chứng minh trên trang chi tiết — chỉ xem; đính/gỡ ảnh nằm ở form tạo/sửa phiếu. */
export function MaterialWasteImagesCard({ wasteId }: { wasteId: string }) {
  const { data: images = [], isLoading } = useMaterialWasteImages(wasteId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ảnh chứng minh</CardTitle>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <p className="text-sm text-slate-400">Đang tải ảnh...</p>
        ) : images.length === 0 ? (
          <p className="text-sm text-slate-400">Phiếu này không có ảnh.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              // URL ký có hạn 1 giờ — mở tab mới để xem ảnh gốc.
              <a key={image.id} href={image.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt="Ảnh chứng minh"
                  className="h-24 w-24 rounded border border-slate-200 object-cover hover:opacity-80"
                />
              </a>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
