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
    header: "VAT",
    accessorFn: (row) => (row.vatPercent != null ? `${Number(row.vatPercent)}%` : "—"),
    id: "vatPercent",
  },
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
  {
    header: "Công thức",
    id: "recipe",
    cell: ({ row }) => (
      <Link href={`/catalog/finished-goods/${row.original.id}/recipe`} className="text-sm text-indigo-600 hover:underline">
        Khai báo công thức
      </Link>
    ),
  },
  {
    header: "Giá theo thời gian",
    id: "prices",
    cell: ({ row }) => (
      <Link href={`/catalog/finished-goods/${row.original.id}/prices`} className="text-sm text-indigo-600 hover:underline">
        Lịch sử giá bán
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
        name: "vatPercent",
        label: "VAT (%) — để trống coi như 0%",
        type: "number" as const,
        // Để trống phải GỠ được VAT đã khai, không chỉ là "không sửa" — xem buildPayload.
        clearable: true,
      },
      {
        name: "active",
        label: "Đang sử dụng (bỏ tick để ẩn khỏi phiếu kiểm, phiếu huỷ và trang Menu theo quán)",
        type: "checkbox" as const,
      },
    ],
    [units],
  );

  const filters = useMemo(
    () => [
      {
        name: "active",
        label: "Trạng thái",
        options: [
          { value: "true", label: "Đang dùng" },
          { value: "false", label: "Ngừng dùng" },
        ],
      },
    ],
    [],
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
      filters={filters}
      search={search}
      onSearchChange={setSearch}
      headerExtra={<FinishedGoodItemExcelImport items={finishedGoodItems} search={search} />}
    />
  );
}
