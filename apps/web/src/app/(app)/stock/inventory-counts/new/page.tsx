"use client";

import { InventoryCountEditor } from "@/components/inventoryCounts/InventoryCountEditor";
import Link from "next/link";

export default function NewInventoryCountPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/stock/inventory-counts" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu kiểm kê
      </Link>
      <InventoryCountEditor mode="create" />
    </div>
  );
}
