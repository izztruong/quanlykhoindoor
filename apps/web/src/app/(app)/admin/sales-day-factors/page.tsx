"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import type { SalesDayFactor } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns: ColumnDef<SalesDayFactor>[] = [
  { header: "Ngày", accessorFn: (row) => String(row.date).slice(0, 10), id: "date" },
  { header: "Hệ số", accessorFn: (row) => Number(row.factor), id: "factor" },
  {
    header: "Nghĩa là",
    id: "meaning",
    cell: ({ row }) => {
      const f = Number(row.original.factor);
      if (f > 1) return `đông gấp ${f} lần ngày thường`;
      if (f === 1) return "như ngày thường";
      if (f === 0) return "đóng cửa cả ngày";
      return `chỉ còn ${Math.round(f * 100)}% ngày thường`;
    },
  },
  { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
];

export default function SalesDayFactorsPage() {
  const [search, setSearch] = useState("");

  return (
    <CatalogPage<SalesDayFactor>
      title="Hệ số ngày lễ"
      resource="SALES_DAY_FACTORS"
      description="Lễ tết, khai trương, đóng đường — những ngày mà doanh số lệch hẳn khỏi mức bình thường của thứ đó. Phải khai tay và sẽ luôn phải khai tay: không dữ liệu nào trong hệ thống nói trước được rằng mai là 30 Tết, và một năm chạy chỉ cho đúng một quan sát về Tết. Hệ số áp cho mọi quán, và được dùng ở cả hai chiều: nhân vào dự báo của ngày sắp tới, và chia lại khi học từ một ngày lễ đã qua để nó không đội mức nền của thứ đó lên mãi."
      endpoint="/sales-day-factors"
      queryKey="sales-day-factors"
      columns={columns}
      fields={[
        { name: "date", label: "Ngày (YYYY-MM-DD)", required: true },
        { name: "factor", label: "Hệ số (1 = như ngày thường, 1.8 = đông gấp 1,8 lần, 0 = đóng cửa)", type: "number" as const, required: true },
        { name: "note", label: "Ghi chú (vd: 30 Tết, Quốc khánh)" },
      ]}
      search={search}
      onSearchChange={setSearch}
    />
  );
}
