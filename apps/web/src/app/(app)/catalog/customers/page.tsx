"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import type { Customer } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Customer>[] = [
  { header: "Mã khách hàng", accessorKey: "code" },
  { header: "Tên khách hàng", accessorKey: "name" },
  { header: "Điện thoại", accessorFn: (row) => row.phone ?? "-", id: "phone" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
];

export default function CustomersPage() {
  return (
    <CatalogPage<Customer>
      title="Khách hàng"
      description="Danh sách khách hàng."
      endpoint="/customers"
      queryKey="customers"
      columns={columns}
      fields={[
        { name: "code", label: "Mã khách hàng", required: true },
        { name: "name", label: "Tên khách hàng", required: true },
        { name: "phone", label: "Điện thoại" },
        { name: "address", label: "Địa chỉ" },
      ]}
    />
  );
}
