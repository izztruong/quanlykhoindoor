"use client";

import { MaterialWasteFormClient } from "@/components/materialWaste/MaterialWasteFormClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useMaterialWaste } from "@/hooks/useMaterialWaste";
import { use } from "react";

export default function EditMaterialWastePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: waste, isLoading } = useMaterialWaste(id);

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;

  if (!waste) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu huỷ.</CardBody>
      </Card>
    );
  }

  return <MaterialWasteFormClient existing={waste} />;
}
