"use client";

import { PurchaseSummaryClient } from "@/components/reports/PurchaseSummaryClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useCurrentUser } from "@/lib/auth";

export default function PurchaseSummaryPage() {
  // (app)/admin không có layout RequireAdmin như (app)/audit, nên từng trang tự chặn — giống
  // reorder-thresholds và product-supplier-prices.
  const { data: currentUser } = useCurrentUser();

  if (currentUser && currentUser.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  return <PurchaseSummaryClient />;
}
