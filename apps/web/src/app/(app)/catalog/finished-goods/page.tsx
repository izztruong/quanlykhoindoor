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
    header: "Pha trước",
    id: "prepared",
    cell: ({ row }) =>
      row.original.prepared ? (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {row.original.batchSize != null ? `1 mẻ = ${Number(row.original.batchSize)}` : "chưa khai mẻ"}
          {row.original.shelfLifeHours != null && ` · ${row.original.shelfLifeHours}h`}
        </span>
      ) : (
        "—"
      ),
  },
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
      {
        name: "prepared",
        label: "Phải pha trước mỗi ca (chỉ món này vào màn Chuẩn bị ca và danh sách đếm cuối ca)",
        type: "checkbox" as const,
      },
      {
        name: "batchSize",
        label: "Một mẻ ra bao nhiêu đơn vị (để trống = pha lẻ được, khi đó đề xuất tính theo đơn vị)",
        type: "number" as const,
        clearable: true,
      },
      {
        name: "shelfLifeHours",
        label: "Pha xong dùng được mấy GIỜ (quyết định một mẻ phủ mấy ca, và có giữ được qua đêm không)",
        type: "number" as const,
        clearable: true,
      },
    ],
    [units],
  );

  return (
    <CatalogPage<FinishedGoodItem>
      title="Đồ thành phẩm"
      resource="FINISHED_GOODS"
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
