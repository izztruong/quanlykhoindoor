"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { SimpleCodeNameExcelActions } from "@/components/catalog/SimpleCodeNameExcelActions";
import { useUnits } from "@/hooks/useCatalog";
import type { Unit } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns: ColumnDef<Unit>[] = [
  { header: "Mã đơn vị", accessorKey: "code" },
  { header: "Tên đơn vị", accessorKey: "name" },
];

export default function UnitsPage() {
  const { data: units = [] } = useUnits();
  const [search, setSearch] = useState("");

  return (
    <CatalogPage<Unit>
      title="Đơn vị tính"
      description="Đơn vị tính của hàng hoá (Kg, Túi, Chai...)."
      endpoint="/units"
      queryKey="units"
      columns={columns}
      fields={[
        { name: "code", label: "Mã đơn vị", required: true },
        { name: "name", label: "Tên đơn vị", required: true },
      ]}
      search={search}
      onSearchChange={setSearch}
      headerExtra={
        <SimpleCodeNameExcelActions
          entityLabel="đơn vị tính"
          codeLabel="Mã đơn vị"
          nameLabel="Tên đơn vị"
          endpoint="/units"
          queryKey="units"
          items={units}
          fileBaseName="don-vi-tinh"
          search={search}
        />
      }
    />
  );
}
