"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { useReorderThresholds } from "@/hooks/useReorderThresholds";
import { useCreateSalesOrder } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import { formatNumber } from "@/lib/format";
import type { ReorderThreshold } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export default function QuickOrderPage() {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: thresholds = [] } = useReorderThresholds();
  const createOrder = useCreateSalesOrder();
  const [warehouseId, setWarehouseId] = useState("");
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const excelMenuRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!excelMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (excelMenuRef.current && !excelMenuRef.current.contains(e.target as Node)) setExcelMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [excelMenuOpen]);

  const suggestedQty = useCallback(
    (threshold: ReorderThreshold): number => {
      const raw = stockInputs[threshold.productId];
      if (raw === undefined || raw === "") return 0;
      const current = Number(raw);
      if (!Number.isFinite(current)) return 0;
      const min = Number(threshold.minQuantity);
      const max = Number(threshold.maxQuantity);
      if (current < min) return Math.round((max - current) * 1000) / 1000;
      return 0;
    },
    [stockInputs],
  );

  const orderItems = useMemo(
    () =>
      thresholds
        .map((t) => ({ productId: t.productId, quantity: suggestedQty(t) }))
        .filter((it) => it.quantity > 0),
    [thresholds, suggestedQty],
  );

  function onSubmit() {
    setError(null);
    if (!warehouseId) {
      setError("Vui lòng chọn kho hàng");
      return;
    }
    if (orderItems.length === 0) {
      setError("Chưa có hàng hoá nào cần đặt thêm");
      return;
    }
    createOrder.mutate(
      { warehouseId, items: orderItems, skipStockCheck: true },
      {
        onSuccess: (order) => router.replace(`/orders/${order.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Tạo đơn hàng thất bại"),
      },
    );
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Order nhanh");
    sheet.columns = ["Tên hàng hoá*", "Tồn hiện tại"].map((header) => ({ header, width: 28 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([thresholds[0]?.product.name ?? "Tên hàng hoá mẫu", 0]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-order-nhanh.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setImportResult({ updated: 0, errors: ["Không đọc được sheet nào trong file."] });
        return;
      }

      const thresholdByName = new Map(thresholds.map((t) => [t.product.name.trim().toLowerCase(), t]));
      const errors: string[] = [];
      let updated = 0;
      const nextInputs = { ...stockInputs };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = String(row.getCell(1).value ?? "").trim();
        const qtyRaw = row.getCell(2).value;
        if (!name) return;

        const threshold = thresholdByName.get(name.toLowerCase());
        if (!threshold) {
          errors.push(`Dòng ${rowNumber}: hàng hoá "${name}" không có trong danh sách order nhanh của bạn`);
          return;
        }

        // Blank tồn hiện tại means "don't order this item" — skip silently, not an error.
        if (qtyRaw === null || qtyRaw === undefined || qtyRaw === "") return;

        const qty = Number(qtyRaw);
        if (Number.isNaN(qty)) {
          errors.push(`Dòng ${rowNumber}: tồn hiện tại không hợp lệ`);
          return;
        }

        nextInputs[threshold.productId] = String(qty);
        updated++;
      });

      setStockInputs(nextInputs);
      setImportResult({ updated, errors });
    } catch {
      setImportResult({ updated: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  async function exportData() {
    setExcelMenuOpen(false);
    const columns: ExcelColumn<ReorderThreshold>[] = [
      { header: "Tên hàng hoá", value: (t) => t.product.name },
      { header: "Mã hàng hoá", value: (t) => t.product.code },
      { header: "ĐVT", value: (t) => t.product.unit?.name ?? "-" },
      { header: "Tối thiểu", value: (t) => formatNumber(t.minQuantity) },
      { header: "Tối đa", value: (t) => formatNumber(t.maxQuantity) },
      { header: "Tồn hiện tại", value: (t) => stockInputs[t.productId] ?? "" },
      { header: "SL cần đặt", value: (t) => suggestedQty(t) },
    ];
    await exportRowsToExcel("Order nhanh", columns, thresholds, "order-nhanh.xlsx");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Order nhanh</h1>
        <p className="text-sm text-slate-500">
          Nhập tồn hiện tại, hệ thống tự tính số lượng cần đặt theo định lượng tối thiểu / tối đa đã thiết lập cho bạn.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Kho xuất</label>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Chọn kho hàng</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hàng hoá order nhanh</CardTitle>
          {thresholds.length > 0 && (
            <div className="relative" ref={excelMenuRef}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setExcelMenuOpen((o) => !o)}>
                Nhập & xuất excel
                <ChevronDown size={14} />
              </Button>
              {excelMenuOpen && (
                <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setExcelMenuOpen(false);
                      setImportResult(null);
                      setImportOpen(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Nhập dữ liệu
                  </button>
                  <button type="button" onClick={exportData} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    Xuất dữ liệu
                  </button>
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardBody className="overflow-x-auto">
          {thresholds.length === 0 ? (
            <p className="text-sm text-slate-500">
              Bạn chưa được thiết lập định lượng tối thiểu / tối đa cho hàng hoá nào. Liên hệ quản trị viên để thiết lập.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-3">Mã</th>
                  <th className="py-2 pr-3">Tên hàng hoá</th>
                  <th className="py-2 pr-3">ĐVT</th>
                  <th className="py-2 pr-3">Tối thiểu</th>
                  <th className="py-2 pr-3">Tối đa</th>
                  <th className="py-2 pr-3">Tồn hiện tại</th>
                  <th className="py-2 pr-3">SL cần đặt</th>
                </tr>
              </thead>
              <tbody>
                {thresholds.map((t) => {
                  const qty = suggestedQty(t);
                  return (
                    <tr key={t.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3">{t.product.code}</td>
                      <td className="py-2 pr-3">{t.product.name}</td>
                      <td className="py-2 pr-3">{t.product.unit?.name}</td>
                      <td className="py-2 pr-3">{formatNumber(t.minQuantity)}</td>
                      <td className="py-2 pr-3">{formatNumber(t.maxQuantity)}</td>
                      <td className="py-2 pr-3">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-28"
                          value={stockInputs[t.productId] ?? ""}
                          onChange={(e) => setStockInputs((prev) => ({ ...prev, [t.productId]: e.target.value }))}
                        />
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        {qty > 0 ? <span className="text-red-600">{formatNumber(qty)}</span> : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onSubmit} disabled={createOrder.isPending}>
          {createOrder.isPending ? "Đang lưu..." : "Tạo đơn hàng"}
        </Button>
      </div>

      {importOpen && (
        <Modal title="Nhập tồn hiện tại từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Tên hàng hoá*, Tồn hiện tại (cột có dấu * là bắt buộc phải
              điền). Để trống Tồn hiện tại nghĩa là không đặt thêm hàng hoá đó. Chỉ áp dụng cho hàng hoá đã có trong danh sách
              order nhanh của bạn.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">Đã cập nhật tồn hiện tại cho {importResult.updated} hàng hoá.</p>
                {importResult.errors.length > 0 && (
                  <div>
                    <p className="font-medium text-red-600">Bỏ qua {importResult.errors.length} dòng lỗi:</p>
                    <ul className="mt-1 list-disc pl-5 text-red-600">
                      {importResult.errors.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
