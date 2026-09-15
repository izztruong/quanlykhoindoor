"use client";

import { MaterialTransferFormClient } from "@/components/materialTransfers/MaterialTransferFormClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { use } from "react";

export default function EditMaterialTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: transfer, isLoading } = useMaterialTransfer(id);

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;

  if (!transfer) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu điều chuyển.</CardBody>
      </Card>
    );
  }

  return <MaterialTransferFormClient existing={transfer} />;
}
