"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProductGroups, useWarehouses } from "@/hooks/useCatalog";
import { api } from "@/lib/api-client";
import { exportRowsToExcel, type ExcelColumn } from "@/lib/excelExport";
import { formatNumber } from "@/lib/format";
import type { InventoryCountRow } from "@/types";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const excelColumns: ExcelColumn<InventoryCountRow>[] = [
  { header: "Mã hàng hoá", value: (row) => row.product.code },
  { header: "Tên hàng hoá", value: (row) => row.product.name },
  { header: "Đơn vị tính", value: (row) => row.unit?.name ?? "-" },
  { header: "Nhóm hàng hoá", value: (row) => row.productGroup?.name ?? "-" },
  { header: "Tồn kho", value: (row) => row.systemQty },
];

export default function CurrentStockPage() {
  const { data: warehouses = [] } = useWarehouses();
  const { data: productGroups = [] } = useProductGroups();
  const [warehouseId, setWarehouseId] = useState("");
  const [productGroupId, setProductGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const asOf = today();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "current-stock", warehouseId, productGroupId],
    queryFn: () =>
      api.get<{ items: InventoryCountRow[] }>("/reports/inventory-count", {
        warehouseId,
        productGroupId: productGroupId || undefined,
        from: asOf,
        to: asOf,
      }),
    enabled: Boolean(warehouseId),
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((r) => r.product.code.toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q));
  }, [data, search]);

  const columns = useMemo<ColumnDef<InventoryCountRow>[]>(
    () => [
      { header: "Mã hàng hoá", accessorFn: (row) => row.product.code, id: "code" },
      { header: "Tên hàng hoá", accessorFn: (row) => row.product.name, id: "name" },
      { header: "Đơn vị tính", accessorFn: (row) => row.unit?.name, id: "unit" },
      { header: "Nhóm hàng hoá", accessorFn: (row) => row.productGroup?.name, id: "productGroup" },
      { header: "Tồn kho", id: "systemQty", cell: ({ row }) => formatNumber(row.original.systemQty) },
    ],
    [],
  );

  async function handleExport() {
    setExporting(true);
    try {
      await exportRowsToExcel("Tồn kho hiện tại", excelColumns, rows, "ton-kho-hien-tai.xlsx");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Tồn kho hiện tại</h1>
          <p className="text-sm text-slate-500">Số lượng tồn kho tính đến hôm nay ({asOf.split("-").reverse().join("/")}).</p>
        </div>
        <Button type="button" variant="secondary" onClick={handleExport} disabled={!warehouseId || exporting}>
          <FileSpreadsheet size={16} />
          {exporting ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">Kho hàng *</label>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Chọn kho hàng</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nhóm hàng hoá</label>
            <Select value={productGroupId} onChange={(e) => setProductGroupId(e.target.value)}>
              <option value="">Tất cả nhóm hàng hoá</option>
              {productGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-64">
            <label className="mb-1 block text-xs font-medium text-slate-500">Tìm theo mã/tên</label>
            <Input placeholder="Nhập mã hoặc tên hàng hoá..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách hàng hoá</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {!warehouseId ? (
            <p className="p-5 text-sm text-slate-400">Vui lòng chọn kho hàng để xem tồn kho.</p>
          ) : (
            <DataTable columns={columns} data={rows} isLoading={isLoading} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
