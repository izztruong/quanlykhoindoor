"use client";

import { MaterialWasteFormClient } from "@/components/materialWaste/MaterialWasteFormClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useMaterialWaste } from "@/hooks/useMaterialWaste";
import { useCurrentUser } from "@/lib/auth";
import { use } from "react";

export default function EditMaterialWastePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: waste, isLoading } = useMaterialWaste(id);

  if (userLoading || isLoading) return <p className="text-slate-400">Đang tải...</p>;

  if (currentUser?.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Chỉ quản trị viên mới được sửa phiếu huỷ nguyên liệu.</CardBody>
      </Card>
    );
  }

  if (!waste) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu huỷ.</CardBody>
      </Card>
    );
  }

  return <MaterialWasteFormClient existing={waste} />;
}
