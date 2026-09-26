"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { SupplierExcelImport } from "@/components/catalog/SupplierExcelImport";
import { useSuppliers } from "@/hooks/useCatalog";
import { formatCurrency } from "@/lib/format";
import type { Supplier } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns: ColumnDef<Supplier>[] = [
  { header: "Mã NCC", accessorKey: "code" },
  { header: "Tên nhà cung cấp", accessorKey: "name" },
  { header: "Điện thoại", accessorFn: (row) => row.phone ?? "-", id: "phone" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
  {
    header: "Ngưỡng miễn ship",
    accessorFn: (row) => (row.freeShipThreshold == null ? "-" : formatCurrency(row.freeShipThreshold)),
    id: "freeShipThreshold",
  },
];

export default function SuppliersPage() {
  const { data: suppliers = [] } = useSuppliers();
  const [search, setSearch] = useState("");

  return (
    <CatalogPage<Supplier>
      title="Nhà cung cấp"
      resource="SUPPLIERS"
      description="Danh sách nhà cung cấp hàng hoá."
      endpoint="/suppliers"
      queryKey="suppliers"
      columns={columns}
      fields={[
        { name: "code", label: "Mã NCC", required: true },
        { name: "name", label: "Tên nhà cung cấp", required: true },
        { name: "phone", label: "Điện thoại" },
        { name: "address", label: "Địa chỉ" },
        {
          name: "freeShipThreshold",
          label: "Đơn từ bao nhiêu tiền thì miễn ship (để trống = NCC không có chính sách này)",
          type: "number" as const,
          clearable: true,
        },
      ]}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<SupplierExcelImport items={suppliers} search={search} />}
    />
  );
}
