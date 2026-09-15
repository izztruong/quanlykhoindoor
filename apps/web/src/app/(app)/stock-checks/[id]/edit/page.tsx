"use client";

import { StockCheckFormClient } from "@/components/stockChecks/StockCheckFormClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useStockCheck } from "@/hooks/useStockChecks";
import { use } from "react";

export default function EditStockCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: stockCheck, isLoading } = useStockCheck(id);

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;

  if (!stockCheck) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu kiểm kê.</CardBody>
      </Card>
    );
  }

  return <StockCheckFormClient existing={stockCheck} />;
}
