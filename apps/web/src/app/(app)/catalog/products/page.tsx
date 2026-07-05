"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { ProductExcelImport } from "@/components/catalog/ProductExcelImport";
import { useProductGroups, useUnits } from "@/hooks/useCatalog";
import { formatCurrency } from "@/lib/format";
import type { Product } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const columns: ColumnDef<Product>[] = [
  { header: "Mã hàng hoá", accessorKey: "code" },
  { header: "Tên hàng hoá", accessorKey: "name" },
  { header: "Đơn vị", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
  { header: "Giá vốn", accessorFn: (row) => formatCurrency(row.costPrice), id: "costPrice" },
];

export default function ProductsPage() {
  const { data: units = [] } = useUnits();
  const { data: productGroups = [] } = useProductGroups();
  const [search, setSearch] = useState("");

  const fields = useMemo(
    () => [
      { name: "code", label: "Mã hàng hoá", required: true },
      { name: "name", label: "Tên hàng hoá", required: true },
      {
        name: "unitId",
        label: "Đơn vị tính",
        type: "select" as const,
        required: true,
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      {
        name: "productGroupId",
        label: "Nhóm hàng hoá",
        type: "select" as const,
        required: true,
        options: productGroups.map((g) => ({ value: g.id, label: g.name })),
      },
      { name: "costPrice", label: "Giá vốn", type: "number" as const, required: true },
      { name: "note", label: "Ghi chú" },
    ],
    [units, productGroups],
  );

  return (
    <CatalogPage<Product>
      title="Hàng hoá"
      description="Danh mục hàng hoá dùng trong nhập/xuất kho, kiểm kê và đơn hàng."
      endpoint="/products"
      queryKey="products"
      columns={columns}
      fields={fields}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<ProductExcelImport search={search} />}
    />
  );
}
