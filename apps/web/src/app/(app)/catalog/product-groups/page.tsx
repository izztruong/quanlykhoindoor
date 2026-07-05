"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { SimpleCodeNameExcelActions } from "@/components/catalog/SimpleCodeNameExcelActions";
import { useProductGroups } from "@/hooks/useCatalog";
import type { ProductGroup } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns: ColumnDef<ProductGroup>[] = [
  { header: "Mã nhóm", accessorKey: "code" },
  { header: "Tên nhóm", accessorKey: "name" },
];

export default function ProductGroupsPage() {
  const { data: productGroups = [] } = useProductGroups();
  const [search, setSearch] = useState("");

  return (
    <CatalogPage<ProductGroup>
      title="Nhóm hàng hoá"
      description="Phân nhóm hàng hoá để lọc và báo cáo."
      endpoint="/product-groups"
      queryKey="product-groups"
      columns={columns}
      fields={[
        { name: "code", label: "Mã nhóm", required: true },
        { name: "name", label: "Tên nhóm", required: true },
      ]}
      search={search}
      onSearchChange={setSearch}
      headerExtra={
        <SimpleCodeNameExcelActions
          entityLabel="nhóm hàng hoá"
          codeLabel="Mã nhóm"
          nameLabel="Tên nhóm"
          endpoint="/product-groups"
          queryKey="product-groups"
          items={productGroups}
          fileBaseName="nhom-hang-hoa"
          search={search}
        />
      }
    />
  );
}
