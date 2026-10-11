"use client";

import { CatalogPage } from "@/components/catalog/CatalogPage";
import { useUserOptions } from "@/hooks/useUsers";
import type { Warehouse } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

const columns: ColumnDef<Warehouse>[] = [
  { header: "Mã kho", accessorKey: "code" },
  { header: "Tên kho", accessorKey: "name" },
  { header: "Quán", accessorFn: (row) => row.shopUser?.name ?? "—", id: "shopUser" },
  { header: "Địa chỉ", accessorFn: (row) => row.address ?? "-", id: "address" },
];

export default function WarehousesPage() {
  // Mặc định scope "shop" — server chỉ trả tài khoản thuộc vai trò có tick "Là quán", đúng tập mà
  // kho được phép gán cho.
  const { data: shops = [] } = useUserOptions();

  return (
    <CatalogPage<Warehouse>
      title="Kho hàng"
      resource="WAREHOUSES"
      description="Mỗi quán một kho. Check Cost lấy hàng nhập trong kỳ từ phiếu nhập của kho quán, nên quán nào cũng cần có kho."
      endpoint="/warehouses"
      queryKey="warehouses"
      columns={columns}
      fields={[
        { name: "code", label: "Mã kho", required: true },
        { name: "name", label: "Tên kho", required: true },
        {
          name: "shopUserId",
          label: "Quán",
          type: "select",
          // clearable: để trống phải gửi null, nếu không thì không gỡ được quán khỏi kho.
          clearable: true,
          options: shops.map((shop) => ({ value: shop.id, label: shop.name })),
        },
        { name: "address", label: "Địa chỉ" },
      ]}
    />
  );
}
