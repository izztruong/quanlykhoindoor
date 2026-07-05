"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import type { Warehouse } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Warehouse>[] = [
  { header: "Mã kho", accessorKey: "code" },
  { header: "Tên kho", accessorKey: "name" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
];

export default function WarehousesPage() {
  return (
    <CatalogPage<Warehouse>
      title="Kho hàng"
      description="Danh sách kho hàng dùng để nhập/xuất, kiểm kê."
      endpoint="/warehouses"
      queryKey="warehouses"
      columns={columns}
      fields={[
        { name: "code", label: "Mã kho", required: true },
        { name: "name", label: "Tên kho", required: true },
        { name: "address", label: "Địa chỉ" },
      ]}
    />
  );
}
