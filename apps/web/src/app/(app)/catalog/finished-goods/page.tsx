"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { FinishedGoodItemExcelImport } from "@/components/catalog/FinishedGoodItemExcelImport";
import { useFinishedGoodItems, useUnits } from "@/hooks/useCatalog";
import { FINISHED_GOOD_CATEGORY_OPTIONS, formatCurrency, labels } from "@/lib/format";
import type { FinishedGoodItem } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

const columns: ColumnDef<FinishedGoodItem>[] = [
  { header: "Mã", accessorKey: "code" },
  { header: "Tên đồ thành phẩm", accessorKey: "name" },
  { header: "Đơn vị", accessorFn: (row) => row.unit?.name, id: "unit" },
  { header: "Nhóm", accessorFn: (row) => (row.category ? labels.finishedGoodCategory(row.category) : "—"), id: "category" },
  { header: "Giá bán", accessorFn: (row) => (row.sellingPrice != null ? formatCurrency(row.sellingPrice) : "—"), id: "sellingPrice" },
  {
    header: "Công thức",
    id: "recipe",
    cell: ({ row }) => (
      <Link href={`/catalog/finished-goods/${row.original.id}/recipe`} className="text-sm text-indigo-600 hover:underline">
        Khai báo công thức
      </Link>
    ),
  },
];

export default function FinishedGoodItemsPage() {
  const { data: units = [] } = useUnits();
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const [search, setSearch] = useState("");

  const fields = useMemo(
    () => [
      { name: "code", label: "Mã", required: true },
      { name: "name", label: "Tên đồ thành phẩm", required: true },
      {
        name: "unitId",
        label: "Đơn vị tính",
        type: "select" as const,
        required: true,
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      {
        name: "category",
        label: "Nhóm (Trà / Đồ ăn vặt)",
        type: "select" as const,
        options: FINISHED_GOOD_CATEGORY_OPTIONS,
      },
      { name: "sellingPrice", label: "Giá bán", type: "number" as const },
    ],
    [units],
  );

  return (
    <CatalogPage<FinishedGoodItem>
      title="Đồ thành phẩm"
      description="Danh sách đồ thành phẩm/vật tư dùng khi kiểm kê quán (nước pha sẵn, ly, ống hút, nắp...)."
      endpoint="/finished-good-items"
      queryKey="finished-good-items"
      columns={columns}
      fields={fields}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<FinishedGoodItemExcelImport items={finishedGoodItems} search={search} />}
    />
  );
}
