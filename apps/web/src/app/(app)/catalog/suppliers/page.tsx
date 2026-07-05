"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import type { Supplier } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Supplier>[] = [
  { header: "Mã NCC", accessorKey: "code" },
  { header: "Tên nhà cung cấp", accessorKey: "name" },
  { header: "Điện thoại", accessorFn: (row) => row.phone ?? "-", id: "phone" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
];

export default function SuppliersPage() {
  return (
    <CatalogPage<Supplier>
      title="Nhà cung cấp"
      description="Danh sách nhà cung cấp hàng hoá."
      endpoint="/suppliers"
      queryKey="suppliers"
      columns={columns}
      fields={[
        { name: "code", label: "Mã NCC", required: true },
        { name: "name", label: "Tên nhà cung cấp", required: true },
        { name: "phone", label: "Điện thoại" },
        { name: "address", label: "Địa chỉ" },
      ]}
    />
  );
}
