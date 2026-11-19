"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { FinishedGoodItemExcelImport } from "@/components/catalog/FinishedGoodItemExcelImport";
import { useFinishedGoodItems, useUnits } from "@/hooks/useCatalog";
import { useUserOptions } from "@/hooks/useUsers";
import { FINISHED_GOOD_CATEGORY_OPTIONS, formatCurrency, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { FinishedGoodItem } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

/** "Chung · Riêng: Xuân La, Vũ Ngọc Phan" — phạm vi công thức đang có của món. */
function recipeScopeLabel(item: FinishedGoodItem, shopNameById: Map<string, string>): string {
  const scopes = item.recipeVersions ?? [];
  if (scopes.length === 0) return "Chưa có";
  const parts: string[] = [];
  if (scopes.some((s) => s.shopUserId === null)) parts.push("Chung");
  const own = scopes
    .filter((s): s is { shopUserId: string } => s.shopUserId !== null)
    .map((s) => shopNameById.get(s.shopUserId) ?? "quán khác")
    .sort((a, b) => a.localeCompare(b));
  if (own.length > 0) parts.push(`Riêng: ${own.join(", ")}`);
  return parts.join(" · ");
}

const baseColumns: ColumnDef<FinishedGoodItem>[] = [
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
  // Ô lọc quán chỉ có nghĩa với người xem được mọi quán. Scope "shop" gồm cả Tiệm bánh — đúng, vì tiệm
  // bánh cũng có công thức riêng.
  const { scopeAll } = useCan();
  const { data: shops = [] } = useUserOptions({ enabled: scopeAll });

  const columns = useMemo(() => {
    const shopNameById = new Map(shops.map((s) => [s.id, s.name]));
    const recipeScope: ColumnDef<FinishedGoodItem> = {
      header: "Công thức áp cho",
      id: "recipeScope",
      accessorFn: (row) => recipeScopeLabel(row, shopNameById),
    };
    // Đặt ngay trước cột link "Công thức" để hai cột cùng nghĩa nằm cạnh nhau.
    const at = baseColumns.findIndex((c) => c.id === "recipe");
    return [...baseColumns.slice(0, at), recipeScope, ...baseColumns.slice(at)];
  }, [shops]);

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
      ...(scopeAll
        ? [
            {
              // Lọc theo CÔNG THỨC, không theo menu quán: món có bản riêng của quán + món có bản chung.
              name: "recipeShopUserId",
              label: "Quán",
              options: shops.map((s) => ({ value: s.id, label: s.name })),
            },
          ]
        : []),
      {
        name: "active",
        label: "Trạng thái",
        options: [
          { value: "true", label: "Đang dùng" },
          { value: "false", label: "Ngừng dùng" },
        ],
      },
    ],
    [scopeAll, shops],
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
