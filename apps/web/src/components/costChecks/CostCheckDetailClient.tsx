"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCostCheck } from "@/hooks/useCostChecks";
import { formatCurrency, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import type { CostCheck, CostCheckFinancialSummary } from "@/types";
import ExcelJS from "exceljs";
import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface CostRatioRow {
  label: string;
  value: number;
  pct: number;
}

/** % chênh lệch thực = (SL công thức - SL thực tế) / SL thực tế — trả về dạng phân số để dùng chung với formatPercent. */
function varianceActualPct(row: { theoretical: number; actualUsed: number }): number {
  return row.actualUsed !== 0 ? (row.theoretical - row.actualUsed) / row.actualUsed : 0;
}

function buildCostRatioRows(s: CostCheckFinancialSummary): CostRatioRow[] {
  return [
    { label: "Chi phí NVL Trà dự kiến (theo công thức)", value: s.expectedNvlTra, pct: s.expectedNvlTraPct },
    { label: "Chi phí ĐAV dự kiến (theo công thức)", value: s.expectedDav, pct: s.expectedDavPct },
    { label: "Chi phí NVL Trà thực tế", value: s.actualNvlTra, pct: s.actualNvlTraPct },
    { label: "Chi phí ĐAV thực tế", value: s.actualDav, pct: s.actualDavPct },
    { label: "Cốc & ống hút thực tế", value: s.cupsStraws, pct: s.cupsStrawsPct },
    { label: "Cost thực tế / doanh thu Trà (gồm cốc)", value: s.actualCostTraValue, pct: s.actualCostTraPct },
    { label: "Cost thực tế / doanh thu Tổng (gồm cốc, bánh)", value: s.actualCostTotalValue, pct: s.actualCostTotalPct },
    { label: "NVL huỷ / doanh thu thuần Trà", value: s.wasteNvlValue, pct: s.wasteNvlPct },
  ];
}

async function exportCostCheckToExcel(costCheck: CostCheck) {
  const workbook = new ExcelJS.Workbook();

  const infoSheet = workbook.addWorksheet("Thông tin chung");
  infoSheet.columns = [{ width: 26 }, { width: 44 }];
  const infoRows: [string, string][] = [
    ["Mã phiếu", costCheck.code],
    ["Quán", costCheck.user?.name ?? "-"],
    ["Phiếu kiểm kê đầu kỳ", `${costCheck.openingStockCheck.code} — ${formatDateTime(costCheck.openingStockCheck.checkedAt)}`],
    ["Phiếu kiểm kê cuối kỳ", `${costCheck.closingStockCheck.code} — ${formatDateTime(costCheck.closingStockCheck.checkedAt)}`],
    ["Người tạo", costCheck.createdBy?.name ?? "-"],
    ["Ngày tạo", formatDateTime(costCheck.createdAt)],
    ["Ghi chú", costCheck.note ?? "-"],
  ];
  infoRows.forEach((row) => infoSheet.addRow(row));
  infoSheet.getColumn(1).font = { bold: true };

  if (costCheck.financialSummary) {
    const s = costCheck.financialSummary;
    const summarySheet = workbook.addWorksheet("Doanh thu & Chi phí");
    summarySheet.columns = [{ width: 44 }, { width: 16 }, { width: 16 }, { width: 16 }];
    summarySheet.addRow(["", "Trà", "ĐAV", "Tổng"]).font = { bold: true };
    summarySheet.addRow(["Tổng doanh thu", s.revenueTra, s.revenueDav, s.revenueTotal]);
    summarySheet.addRow(["Khuyến mãi", s.discountTra, s.discountDav, s.discountTotal]);
    summarySheet.addRow(["Doanh thu thuần", s.netRevenueTra, s.netRevenueDav, s.netRevenueTotal]);
    summarySheet.addRow([]);
    summarySheet.addRow(["Chỉ tiêu", "Giá trị", "% trên doanh thu"]).font = { bold: true };
    buildCostRatioRows(s).forEach((row) => {
      const excelRow = summarySheet.addRow([row.label, row.value, row.pct]);
      excelRow.getCell(3).numFmt = "0.0%";
    });
  }

  const soldSheet = workbook.addWorksheet("SL đã bán");
  soldSheet.columns = [
    { header: "Đồ thành phẩm/món", width: 32 },
    { header: "Đơn vị", width: 14 },
    { header: "SL đã bán", width: 14 },
  ];
  soldSheet.getRow(1).font = { bold: true };
  (costCheck.soldItems ?? []).forEach((it) =>
    soldSheet.addRow([it.finishedGoodItem.name, it.finishedGoodItem.unit?.name ?? "-", Number(it.quantitySold)]),
  );

  const reportSheet = workbook.addWorksheet("Báo cáo Check Cost");
  reportSheet.columns = [
    { header: "Nguyên liệu", width: 28 },
    { header: "Đơn vị", width: 12 },
    { header: "Tồn đầu kỳ", width: 14 },
    { header: "Nhận trong kỳ", width: 14 },
    { header: "Đã huỷ", width: 12 },
    { header: "Xuất trong kỳ", width: 14 },
    { header: "Tồn cuối kỳ", width: 14 },
    { header: "Thực tế dùng", width: 14 },
    { header: "Theo công thức", width: 14 },
    { header: "Chênh lệch", width: 14 },
    { header: "% chênh lệch thực", width: 16 },
  ];
  reportSheet.getRow(1).font = { bold: true };
  (costCheck.report ?? []).forEach((row) => {
    const excelRow = reportSheet.addRow([
      row.name,
      row.unitLabel,
      row.openingQty,
      row.receivedQty,
      row.wastedQty,
      row.transferOutQty,
      row.closingQty,
      row.actualUsed,
      row.theoretical,
      row.variance,
      varianceActualPct(row),
    ]);
    excelRow.getCell(11).numFmt = "0.0%";
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `check-cost-${costCheck.code}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CostCheckDetailClient({ id }: { id: string }) {
  const { data: costCheck, isLoading } = useCostCheck(id);
  const [exporting, setExporting] = useState(false);

  if (isLoading || !costCheck) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  async function handleExportExcel() {
    if (!costCheck) return;
    setExporting(true);
    try {
      await exportCostCheckToExcel(costCheck);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/cost-checks" className="self-start text-sm text-indigo-600 hover:underline">
            ← Danh sách Check Cost
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-slate-800">Phiếu {costCheck.code}</h1>
          <p className="text-sm text-slate-500">Quán: {costCheck.user?.name ?? "-"}</p>
        </div>
        <Button type="button" variant="secondary" onClick={handleExportExcel} disabled={exporting}>
          <FileSpreadsheet size={16} />
          {exporting ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
          <div>
            <div className="text-slate-400">Phiếu kiểm kê đầu kỳ</div>
            <div className="font-medium text-slate-800">
              {costCheck.openingStockCheck.code} — {formatDateTime(costCheck.openingStockCheck.checkedAt)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Phiếu kiểm kê cuối kỳ</div>
            <div className="font-medium text-slate-800">
              {costCheck.closingStockCheck.code} — {formatDateTime(costCheck.closingStockCheck.checkedAt)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Người tạo</div>
            <div className="font-medium text-slate-800">{costCheck.createdBy?.name ?? "-"}</div>
          </div>
          {costCheck.note && (
            <div>
              <div className="text-slate-400">Ghi chú</div>
              <div className="font-medium text-slate-800">{costCheck.note}</div>
            </div>
          )}
        </CardBody>
      </Card>

      {costCheck.financialSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Doanh thu & Chi phí</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border border-slate-200 px-4 py-2 text-left"> </th>
                  <th className="border border-slate-200 px-4 py-2 text-right">Trà</th>
                  <th className="border border-slate-200 px-4 py-2 text-right">ĐAV</th>
                  <th className="border border-slate-200 px-4 py-2 text-right">Tổng</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-medium text-slate-700">Tổng doanh thu</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.revenueTra)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.revenueDav)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.revenueTotal)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-medium text-slate-700">Khuyến mãi</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.discountTra)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.discountDav)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.discountTotal)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2 font-medium text-slate-700">Doanh thu thuần</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.netRevenueTra)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.netRevenueDav)}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(costCheck.financialSummary.netRevenueTotal)}</td>
                </tr>
              </tbody>
            </table>

            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border border-slate-200 px-4 py-2 text-left">Chỉ tiêu</th>
                  <th className="border border-slate-200 px-4 py-2 text-right">Giá trị</th>
                  <th className="border border-slate-200 px-4 py-2 text-right">% trên doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {buildCostRatioRows(costCheck.financialSummary).map((row) => (
                  <tr key={row.label}>
                    <td className="border border-slate-200 px-4 py-2 font-medium text-slate-700">{row.label}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right">{formatCurrency(row.value)}</td>
                    <td className="border border-slate-200 px-4 py-2 text-right">{formatPercent(row.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>SL đồ thành phẩm/món đã bán trong kỳ</CardTitle>
        </CardHeader>
        <CardBody className="max-h-[420px] overflow-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-4 py-2 text-left">Đồ thành phẩm/món</th>
                <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-4 py-2 text-left">Đơn vị</th>
                <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-4 py-2 text-right">SL đã bán</th>
              </tr>
            </thead>
            <tbody>
              {(costCheck.soldItems ?? []).map((it) => (
                <tr key={it.id}>
                  <td className="border border-slate-200 px-4 py-2">{it.finishedGoodItem.name}</td>
                  <td className="border border-slate-200 px-4 py-2">{it.finishedGoodItem.unit?.name ?? "-"}</td>
                  <td className="border border-slate-200 px-4 py-2 text-right">{formatNumber(it.quantitySold)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Báo cáo Check Cost</CardTitle>
        </CardHeader>
        <CardBody className="max-h-[600px] overflow-auto p-0">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="sticky left-0 top-0 z-20 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-left">
                  Nguyên liệu
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-left">Đơn vị</th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Tồn đầu kỳ
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Nhận trong kỳ
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">Đã huỷ</th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Xuất trong kỳ
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Tồn cuối kỳ
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Thực tế dùng
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Theo công thức
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  Chênh lệch
                </th>
                <th className="sticky top-0 z-10 whitespace-nowrap border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  % chênh lệch thực
                </th>
              </tr>
            </thead>
            <tbody>
              {(costCheck.report ?? []).map((row) => {
                const tone = row.variance > 1e-6 ? "text-red-600" : row.variance < -1e-6 ? "text-emerald-600" : "text-slate-600";
                return (
                  <tr key={row.productId}>
                    <td className="sticky left-0 z-10 whitespace-nowrap border border-slate-200 bg-white px-4 py-2">{row.name}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2">{row.unitLabel}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.openingQty)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.receivedQty)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.wastedQty)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.transferOutQty)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.closingQty)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.actualUsed)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-4 py-2 text-right">{formatNumber(row.theoretical)}</td>
                    <td className={`whitespace-nowrap border border-slate-200 px-4 py-2 text-right font-medium ${tone}`}>
                      {formatNumber(row.variance)}
                    </td>
                    <td className={`whitespace-nowrap border border-slate-200 px-4 py-2 text-right font-medium ${tone}`}>
                      {formatPercent(varianceActualPct(row))}
                    </td>
                  </tr>
                );
              })}
              {(costCheck.report ?? []).length === 0 && (
                <tr>
                  <td colSpan={11} className="border border-slate-200 px-4 py-6 text-center text-slate-400">
                    Không có dữ liệu nguyên liệu nào để đối soát.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
