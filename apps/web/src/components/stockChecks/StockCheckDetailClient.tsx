"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useStockCheck } from "@/hooks/useStockChecks";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Download } from "lucide-react";
import ExcelJS from "exceljs";
import Link from "next/link";

const TEMPLATE_HEADER = ["Tên NL", "Đơn vị", "SL chẵn", "SL lẻ (gam)", "Tên đồ thành phẩm", "Đơn vị kiểm", "Số lượng"];

export function StockCheckDetailClient({ id }: { id: string }) {
  const { data: check, isLoading } = useStockCheck(id);

  if (isLoading || !check) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  async function exportData() {
    if (!check) return;
    const items = check.items ?? [];
    const finishedItems = check.finishedItems ?? [];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kiểm kê");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    const rowCount = Math.max(items.length, finishedItems.length);
    for (let i = 0; i < rowCount; i++) {
      const m = items[i];
      const f = finishedItems[i];
      sheet.addRow([
        m?.product.name ?? "",
        m?.product.unit?.name ?? "",
        m?.wholeQuantity ?? "",
        m?.looseQuantity ?? "",
        f?.finishedGoodItem.name ?? "",
        f?.finishedGoodItem.unit?.name ?? "",
        f?.quantity ?? "",
      ]);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `phieu-kiem-ke-${check.code}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/stock-checks" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu kiểm kê
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Phiếu kiểm kê {check.code}</h1>
          <p className="text-sm text-slate-500">Thời gian kiểm: {formatDateTime(check.createdAt)}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={exportData}>
          <Download size={14} />
          Xuất excel
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Nguyên liệu</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="px-5 py-2">Tên NL</th>
                    <th className="px-5 py-2">Đơn vị</th>
                    <th className="px-5 py-2">SL chẵn</th>
                    <th className="px-5 py-2">SL lẻ (gam)</th>
                    <th className="px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(check.items ?? []).map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-5 py-2">{item.product.name}</td>
                      <td className="px-5 py-2">{item.product.unit?.name}</td>
                      <td className="px-5 py-2">{item.wholeQuantity != null ? formatNumber(item.wholeQuantity) : "-"}</td>
                      <td className="px-5 py-2">{item.looseQuantity != null ? formatNumber(item.looseQuantity) : "-"}</td>
                      <td className="px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(check.items ?? []).length === 0 && (
                    <tr>
                      <td className="px-5 py-3 text-slate-400" colSpan={5}>
                        Không có dòng nguyên liệu nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Đồ thành phẩm</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="px-5 py-2">Tên đồ thành phẩm</th>
                    <th className="px-5 py-2">Đơn vị kiểm</th>
                    <th className="px-5 py-2">Số lượng</th>
                    <th className="px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(check.finishedItems ?? []).map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="px-5 py-2">{item.finishedGoodItem.name}</td>
                      <td className="px-5 py-2">{item.finishedGoodItem.unit?.name}</td>
                      <td className="px-5 py-2">{formatNumber(item.quantity)}</td>
                      <td className="px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(check.finishedItems ?? []).length === 0 && (
                    <tr>
                      <td className="px-5 py-3 text-slate-400" colSpan={4}>
                        Không có dòng đồ thành phẩm nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian kiểm</label>
              <p className="text-sm font-medium text-slate-800">{formatDateTime(check.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <p className="text-sm text-slate-800">{check.note || "-"}</p>
            </div>
            {check.createdBy && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Người tạo</label>
                <p className="text-sm text-slate-800">{check.createdBy.name}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
