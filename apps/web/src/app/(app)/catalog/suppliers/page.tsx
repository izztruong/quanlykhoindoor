"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { SupplierExcelImport } from "@/components/catalog/SupplierExcelImport";
import { useSuppliers } from "@/hooks/useCatalog";
import { useUserOptions } from "@/hooks/useUsers";
import type { Supplier } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns: ColumnDef<Supplier>[] = [
  { header: "Mã NCC", accessorKey: "code" },
  { header: "Tên nhà cung cấp", accessorKey: "name" },
  { header: "Điện thoại", accessorFn: (row) => row.phone ?? "-", id: "phone" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
  { header: "Tiệm bánh", accessorFn: (row) => row.bakeryUser?.name ?? "—", id: "bakeryUser" },
];

export default function SuppliersPage() {
  const { data: suppliers = [] } = useSuppliers();
  const [search, setSearch] = useState("");
  const { data: bakeries = [] } = useUserOptions({ scope: "bakery" });

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
          name: "bakeryUserId",
          label: "Tài khoản tiệm bánh (chỉ chọn nếu NCC này là tiệm bánh nhận Đơn bánh)",
          type: "select",
          // clearable: để trống phải gửi null, nếu không thì không gỡ được nối.
          clearable: true,
          options: bakeries.map((b) => ({ value: b.id, label: b.name })),
        },
      ]}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<SupplierExcelImport items={suppliers} search={search} />}
    />
  );
}
