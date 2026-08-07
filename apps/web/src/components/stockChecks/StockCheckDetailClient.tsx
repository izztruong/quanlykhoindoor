"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useStockCheck } from "@/hooks/useStockChecks";
import { sanitizeExcelRow } from "@/lib/excelExport";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth";
import { Download, Pencil } from "lucide-react";
import ExcelJS from "exceljs";
import Link from "next/link";

const TEMPLATE_HEADER = [
  "Tên NL",
  "Đơn vị",
  "SL chẵn",
  "Giá chẵn",
  "T.tiền chẵn",
  "SL lẻ (theo đơn vị công thức)",
  "Giá lẻ",
  "T.tiền lẻ",
  "Tên đồ thành phẩm",
  "Đơn vị kiểm",
  "Số lượng",
  "Giá",
  "Thành tiền",
];

/** Thành tiền = SL × đơn giá; thiếu vế nào thì coi như 0 (phiếu cũ chưa có giá). */
function lineAmount(quantity?: string | number | null, price?: string | number | null): number {
  const qty = Number(quantity);
  const unitPrice = Number(price);
  if (!Number.isFinite(qty) || !Number.isFinite(unitPrice)) return 0;
  return qty * unitPrice;
}

export function StockCheckDetailClient({ id }: { id: string }) {
  const { data: currentUser } = useCurrentUser();
  const { data: check, isLoading } = useStockCheck(id);

  if (isLoading || !check) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  const materialTotal = (check.items ?? []).reduce(
    (sum, item) => sum + lineAmount(item.wholeQuantity, item.wholePrice) + lineAmount(item.looseQuantity, item.loosePrice),
    0,
  );
  const finishedTotal = (check.finishedItems ?? []).reduce((sum, item) => sum + lineAmount(item.quantity, item.price), 0);

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
      sheet.addRow(
        sanitizeExcelRow([
          m?.product.name ?? "",
          m?.product.unit?.name ?? "",
          m?.wholeQuantity ?? "",
          m?.wholePrice ?? "",
          m ? lineAmount(m.wholeQuantity, m.wholePrice) : "",
          m?.looseQuantity ?? "",
          m?.loosePrice ?? "",
          m ? lineAmount(m.looseQuantity, m.loosePrice) : "",
          f?.finishedGoodItem.name ?? "",
          f?.finishedGoodItem.unit?.name ?? "",
          f?.quantity ?? "",
          f?.price ?? "",
          f ? lineAmount(f.quantity, f.price) : "",
        ]),
      );
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
          <p className="text-sm text-slate-500">Thời gian kiểm: {formatDateTime(check.checkedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentUser?.role === "ADMIN" && (
            <Link href={`/stock-checks/${check.id}/edit`}>
              <Button type="button" variant="secondary" size="sm">
                <Pencil size={14} />
                Sửa
              </Button>
            </Link>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={exportData}>
            <Download size={14} />
            Xuất excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Nguyên liệu</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className="border border-slate-200 px-5 py-2">Tên NL</th>
                    <th className="border border-slate-200 px-5 py-2">Đơn vị</th>
                    <th className="border border-slate-200 px-5 py-2">SL chẵn</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">Giá chẵn</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">T.tiền chẵn</th>
                    <th className="border border-slate-200 px-5 py-2">SL lẻ</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">Giá lẻ</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">T.tiền lẻ</th>
                    <th className="border border-slate-200 px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(check.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-5 py-2">{item.product.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.product.unit?.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.wholeQuantity != null ? formatNumber(item.wholeQuantity) : "-"}</td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {item.wholePrice != null ? formatCurrency(item.wholePrice) : "-"}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {formatCurrency(lineAmount(item.wholeQuantity, item.wholePrice))}
                      </td>
                      <td className="border border-slate-200 px-5 py-2">
                        {item.looseQuantity != null
                          ? `${formatNumber(item.looseQuantity)}${item.product.recipeUnit?.name ? ` ${item.product.recipeUnit.name}` : ""}`
                          : "-"}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {item.loosePrice != null ? formatCurrency(item.loosePrice) : "-"}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {formatCurrency(lineAmount(item.looseQuantity, item.loosePrice))}
                      </td>
                      <td className="border border-slate-200 px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(check.items ?? []).length === 0 && (
                    <tr>
                      <td className="border border-slate-200 px-5 py-3 text-slate-400" colSpan={9}>
                        Không có dòng nguyên liệu nào.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700">
                    <td colSpan={7} className="border border-slate-200 px-5 py-2 text-right">
                      Tổng cộng (chẵn + lẻ)
                    </td>
                    <td colSpan={2} className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                      {formatCurrency(materialTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Đồ thành phẩm</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className="border border-slate-200 px-5 py-2">Tên đồ thành phẩm</th>
                    <th className="border border-slate-200 px-5 py-2">Đơn vị kiểm</th>
                    <th className="border border-slate-200 px-5 py-2">Số lượng</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">Giá</th>
                    <th className="border border-slate-200 px-5 py-2 text-right">Thành tiền</th>
                    <th className="border border-slate-200 px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(check.finishedItems ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-5 py-2">{item.finishedGoodItem.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.finishedGoodItem.unit?.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{formatNumber(item.quantity)}</td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {item.price != null ? formatCurrency(item.price) : "-"}
                      </td>
                      <td className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                        {formatCurrency(lineAmount(item.quantity, item.price))}
                      </td>
                      <td className="border border-slate-200 px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(check.finishedItems ?? []).length === 0 && (
                    <tr>
                      <td className="border border-slate-200 px-5 py-3 text-slate-400" colSpan={6}>
                        Không có dòng đồ thành phẩm nào.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold text-slate-700">
                    <td colSpan={4} className="border border-slate-200 px-5 py-2 text-right">
                      Tổng cộng
                    </td>
                    <td colSpan={2} className="whitespace-nowrap border border-slate-200 px-5 py-2 text-right">
                      {formatCurrency(finishedTotal)}
                    </td>
                  </tr>
                </tfoot>
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
              <p className="text-sm font-medium text-slate-800">{formatDateTime(check.checkedAt)}</p>
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
