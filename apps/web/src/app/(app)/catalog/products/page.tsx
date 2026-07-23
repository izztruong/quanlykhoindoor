"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { ProductExcelImport } from "@/components/catalog/ProductExcelImport";
import { useProductGroups, useUnits } from "@/hooks/useCatalog";
import { PRODUCT_TYPE_OPTIONS, formatCurrency, labels } from "@/lib/format";
import type { Product } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

const columns: ColumnDef<Product>[] = [
  { header: "Mã hàng hoá", accessorKey: "code" },
  { header: "Tên hàng hoá", accessorKey: "name" },
  { header: "Đơn vị", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
  { header: "Loại hàng hoá", accessorFn: (row) => labels.productType(row.type), id: "type" },
  { header: "Giá vốn", accessorFn: (row) => formatCurrency(row.costPrice), id: "costPrice" },
  {
    header: "Trạng thái",
    id: "active",
    cell: ({ row }) =>
      row.original.active === false ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Ngừng dùng</span>
      ) : (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">Đang dùng</span>
      ),
  },
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
      {
        name: "type",
        label: "Loại hàng hoá",
        type: "select" as const,
        required: true,
        options: PRODUCT_TYPE_OPTIONS,
      },
      { name: "note", label: "Ghi chú" },
      {
        name: "recipeUnitId",
        label: "Đơn vị công thức (vd Gram)",
        type: "select" as const,
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      { name: "recipeUnitsPerBaseUnit", label: "Quy đổi: 1 đơn vị chính = ? đơn vị công thức", type: "number" as const },
      {
        name: "tareWeight",
        label: "Khối lượng vỏ (theo đơn vị công thức — SL lẻ nhập cả vỏ sẽ tự trừ số này)",
        type: "number" as const,
      },
      {
        name: "active",
        label: "Đang sử dụng (bỏ tick để ẩn khỏi ô chọn hàng hoá khi tạo phiếu/đơn hàng)",
        type: "checkbox" as const,
      },
    ],
    [units, productGroups],
  );

  const filters = useMemo(
    () => [
      {
        name: "productGroupId",
        label: "Nhóm hàng hoá",
        options: productGroups.map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: "type",
        label: "Loại hàng hoá",
        options: PRODUCT_TYPE_OPTIONS,
      },
      {
        name: "active",
        label: "Trạng thái",
        options: [
          { value: "true", label: "Đang dùng" },
          { value: "false", label: "Ngừng dùng" },
        ],
      },
    ],
    [productGroups],
  );

  return (
    <CatalogPage<Product>
      title="Hàng hoá"
      description="Danh mục hàng hoá dùng trong nhập/xuất kho, kiểm kê và đơn hàng."
      endpoint="/products"
      queryKey="products"
      columns={columns}
      fields={fields}
      filters={filters}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<ProductExcelImport search={search} />}
    />
  );
}
