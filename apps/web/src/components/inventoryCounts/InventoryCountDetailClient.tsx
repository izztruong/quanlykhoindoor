"use client";

import { InventoryCountEditor } from "@/components/inventoryCounts/InventoryCountEditor";
import { useInventoryCount } from "@/hooks/useInventoryCounts";
import Link from "next/link";

export function InventoryCountDetailClient({ id }: { id: string }) {
  const { data: count, isLoading } = useInventoryCount(id);

  if (isLoading || !count) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/stock/inventory-counts" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu kiểm kê
      </Link>
      <InventoryCountEditor mode="edit" count={count} />
    </div>
  );
}
