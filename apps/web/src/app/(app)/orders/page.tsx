"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { useCurrentUser } from "@/lib/auth";
import { formatDateTime, formatNumber, labels } from "@/lib/format";
import type { SalesOrder } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import ExcelJS from "exceljs";
import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  CONFIRMED: "blue",
  SHORT: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

async function exportPurchaseListExcel(selectedOrders: SalesOrder[]) {
  const bySupplier = new Map<string, Map<string, number>>();
  for (const order of selectedOrders) {
    for (const item of order.stockExport?.items ?? []) {
      const supplierName = item.supplier?.name ?? "Chưa chọn NCC";
      const productName = item.product.name;
      if (!bySupplier.has(supplierName)) bySupplier.set(supplierName, new Map());
      const productMap = bySupplier.get(supplierName)!;
      productMap.set(productName, (productMap.get(productName) ?? 0) + Number(item.quantity));
    }
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Phiếu mua hàng");
  sheet.columns = [
    { header: "Nhà cung cấp", width: 24 },
    { header: "Tên hàng hóa", width: 28 },
    { header: "Số lượng", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  let rowIndex = 2;
  for (const [supplierName, productMap] of bySupplier) {
    const startRow = rowIndex;
    for (const [productName, qty] of productMap) {
      sheet.addRow([supplierName, productName, qty]);
      rowIndex++;
    }
    const endRow = rowIndex - 1;
    if (endRow > startRow) sheet.mergeCells(startRow, 1, endRow, 1);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "phieu-mua-hang.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function OrdersPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === "ADMIN";
  const [status, setStatus] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const { data, isLoading } = useSalesOrders({ status, from: dateRange.from || undefined, to: dateRange.to || undefined });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleConfirmExport() {
    const orders = (data?.items ?? []).filter((o) => selected.has(o.id));
    await exportPurchaseListExcel(orders);
    setSelectMode(false);
    setSelected(new Set());
  }

  const columns = useMemo<ColumnDef<SalesOrder>[]>(() => {
    const base: ColumnDef<SalesOrder>[] = [
      {
        header: "Mã đơn",
        id: "code",
        cell: ({ row }) => (
          <Link href={`/orders/${row.original.id}`} className="font-medium text-indigo-600 hover:underline">
            {row.original.code}
          </Link>
        ),
      },
      { header: "Tài khoản", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Kho", accessorFn: (row) => row.warehouse?.name, id: "warehouse" },
      { header: "Ngày đặt", accessorFn: (row) => formatDateTime(row.orderDate), id: "orderDate" },
      {
        header: "Tổng số lượng",
        id: "quantity",
        accessorFn: (row) => formatNumber(row.items.reduce((sum, it) => sum + Number(it.quantity), 0)),
      },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => <Badge tone={statusTone[row.original.status]}>{labels.salesOrderStatus(row.original.status)}</Badge>,
      },
    ];

    if (!selectMode) return base;

    return [
      {
        header: "",
        id: "select",
        cell: ({ row }) =>
          row.original.status === "CONFIRMED" ? (
            <input
              type="checkbox"
              checked={selected.has(row.original.id)}
              onChange={() => toggleSelected(row.original.id)}
              className="h-4 w-4"
            />
          ) : null,
      },
      ...base,
    ];
  }, [selectMode, selected]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Đơn hàng bán</h1>
          <p className="text-sm text-slate-500">Quản lý đơn hàng nội bộ theo tài khoản.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="secondary" onClick={toggleSelectMode}>
              <FileSpreadsheet size={16} />
              {selectMode ? "Huỷ chọn" : "Xuất phiếu mua hàng"}
            </Button>
          )}
          {isAdmin && selectMode && (
            <Button onClick={handleConfirmExport} disabled={selected.size === 0}>
              Xác nhận ({selected.size})
            </Button>
          )}
          <Link href="/orders/new">
            <Button>
              <Plus size={16} />
              Tạo đơn hàng
            </Button>
          </Link>
        </div>
      </div>

      {isAdmin && selectMode && (
        <p className="text-sm text-slate-500">
          Chỉ chọn được đơn hàng ở trạng thái &quot;Đã xác nhận&quot;. Chọn xong bấm &quot;Xác nhận&quot; để xuất file Excel
          gộp hàng hoá theo nhà cung cấp.
        </p>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Trạng thái</label>
            <div className="w-48">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Chưa xác nhận</option>
                <option value="CONFIRMED">Đã xác nhận</option>
                <option value="SHORT">Thiếu</option>
                <option value="COMPLETED">Hoàn thành</option>
                <option value="CANCELLED">Đã huỷ</option>
              </Select>
            </div>
          </div>
          <DateRangeFilter value={dateRange} onChange={setDateRange} label="Ngày đặt" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách đơn hàng</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />
        </CardBody>
      </Card>
    </div>
  );
}
