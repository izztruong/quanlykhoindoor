"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { usePreviewReorderSuggestions, useCommitReorderSuggestions } from "@/hooks/useReorderSuggestions";
import { useReorderThresholds } from "@/hooks/useReorderThresholds";
import { ApiError } from "@/lib/api-client";
import { type ExcelColumn, exportRowsToExcel, sanitizeExcelRow } from "@/lib/excelExport";
import { formatNumber } from "@/lib/format";
import {
  REORDER_MODE_LABELS,
  USAGE_SOURCE_LABELS,
  type ReorderSuggestion,
} from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Không còn số ngày phủ mặc định ở web: server tự tính theo nhịp gọi của từng hàng hoá (công nợ thì tới
// mốc 15/30, trả ngay thì theo coverDays), và ô trên trang chỉ để sửa tay. Giữ một con số mặc định ở đây
// sẽ âm thầm đè số tự tính mỗi lần mở trang.

export default function QuickOrderPage() {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  // Vẫn đọc bảng định lượng để dựng khung bảng ngay khi mở trang, trước khi bấm tính lần đầu.
  const { data: thresholds = [] } = useReorderThresholds();
  const preview = usePreviewReorderSuggestions();
  const commit = useCommitReorderSuggestions();

  const [warehouseId, setWarehouseId] = useState("");
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  // Bỏ trống = để server tính theo nhịp gọi. Chỉ gõ vào khi muốn phủ khác nhịp.
  const [coverDaysOverride, setCoverDaysOverride] = useState("");
  // SL người dùng sửa tay, đè lên SL đề xuất. Khoá theo productId, chỉ dòng nào sửa mới có mặt.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[] | null>(null);
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

  const buildOnHand = useCallback(
    () =>
      Object.entries(stockInputs)
        // Bỏ trống KHÁC với 0: hàng chưa đếm thì server không đề xuất theo tồn, còn đếm được 0 thì phải đặt.
        .filter(([, raw]) => raw !== "" && Number.isFinite(Number(raw)))
        .map(([productId, raw]) => ({ productId, quantity: Number(raw) })),
    [stockInputs],
  );

  const runPreview = useCallback(() => {
    setError(null);
    const override = Number(coverDaysOverride);
    preview.mutate(
      {
        onHand: buildOnHand(),
        // Chỉ gửi khi người dùng thật sự gõ số — gửi mặc định sẽ đè số tự tính theo nhịp gọi.
        coverDays: coverDaysOverride.trim() !== "" && Number.isFinite(override) && override > 0 ? override : undefined,
      },
      {
        onSuccess: (result) => {
          setSuggestions(result.items);
          setOverrides({});
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không tính được số lượng đề xuất"),
      },
    );
  }, [buildOnHand, coverDaysOverride, preview]);

  // Tính ngay khi mở trang để hàng gọi cố định hiện sẵn, chưa cần ai gõ tồn.
  const didInitialPreview = useRef(false);
  useEffect(() => {
    if (didInitialPreview.current || thresholds.length === 0) return;
    didInitialPreview.current = true;
    runPreview();
  }, [thresholds.length, runPreview]);

  const finalQty = useCallback(
    (row: ReorderSuggestion): number => {
      const override = overrides[row.productId];
      if (override === undefined) return row.suggestedQty;
      const parsed = Number(override);
      return override === "" || !Number.isFinite(parsed) || parsed < 0 ? 0 : parsed;
    },
    [overrides],
  );

  // Bọc useMemo thay vì `suggestions ?? []` trực tiếp: mảng rỗng mới mỗi lần render sẽ làm hai useMemo
  // bên dưới tính lại liên tục.
  const rows = useMemo(() => suggestions ?? [], [suggestions]);
  const orderItems = useMemo(
    () => rows.map((r) => ({ productId: r.productId, quantity: finalQty(r) })).filter((it) => it.quantity > 0),
    [rows, finalQty],
  );

  const rowsByGroup = useMemo(() => {
    const groups = new Map<string, ReorderSuggestion[]>();
    for (const row of rows) {
      const list = groups.get(row.productGroupName) ?? [];
      list.push(row);
      groups.set(row.productGroupName, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

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
    commit.mutate(
      {
        warehouseId,
        onHand: buildOnHand(),
        coverDays:
          coverDaysOverride.trim() !== "" && Number(coverDaysOverride) > 0 ? Number(coverDaysOverride) : undefined,
        items: orderItems,
      },
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
    sheet.addRow(sanitizeExcelRow([thresholds[0]?.product.name ?? "Tên hàng hoá mẫu", 0]));
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
    const columns: ExcelColumn<ReorderSuggestion>[] = [
      { header: "Tên hàng hoá", value: (r) => r.name },
      { header: "Mã hàng hoá", value: (r) => r.code },
      { header: "ĐVT", value: (r) => r.unitLabel },
      { header: "Cách gọi", value: (r) => REORDER_MODE_LABELS[r.mode] },
      { header: "Tồn hiện tại", value: (r) => (r.onHandQty == null ? "" : r.onHandQty) },
      { header: "Mức dùng/ngày", value: (r) => (r.dailyUsage == null ? "" : Math.round(r.dailyUsage * 1000) / 1000) },
      { header: "Nguồn mức dùng", value: (r) => USAGE_SOURCE_LABELS[r.usageSource] },
      { header: "Số ngày chờ hàng", value: (r) => (r.leadDays == null ? "" : r.leadDays) },
      { header: "Đang về", value: (r) => r.inTransitQty },
      { header: "SL đề xuất", value: (r) => r.suggestedQty },
      { header: "SL đặt", value: (r) => finalQty(r) },
      { header: "Lý do", value: (r) => r.reasons.join(" · ") },
    ];
    await exportRowsToExcel("Order nhanh", columns, rows, "order-nhanh.xlsx");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Order nhanh</h1>
        <p className="text-sm text-slate-500">
          Nhập tồn hiện tại, hệ thống tính số lượng cần đặt theo cách gọi đã thiết lập cho từng hàng hoá. Cột SL đặt sửa
          được — hệ thống ghi lại cả số đề xuất lẫn số bạn chốt.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-4">
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
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Đặt đủ dùng cho … ngày</label>
            <Input
              type="number"
              min="1"
              max="365"
              placeholder="theo nhịp gọi"
              value={coverDaysOverride}
              onChange={(e) => setCoverDaysOverride(e.target.value)}
            />
            <span className="text-xs text-slate-400">
              Để trống = tự tính theo từng hàng hoá: có công nợ thì phủ tới mốc gọi ngày 15 / 30, trả tiền
              ngay thì phủ số ngày khai ở Danh mục › Hàng hoá. Cột lý do nói rõ đã dùng số nào.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Số ngày chờ hàng về</label>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Theo từng hàng hoá
            </span>
            <span className="text-xs text-slate-400">
              Khai ở Danh mục › Hàng hoá — cà phê chờ khác bột nên không dùng một số chung
            </span>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={runPreview} disabled={preview.isPending}>
              {preview.isPending ? "Đang tính..." : "Tính lại số lượng"}
            </Button>
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
              Bạn chưa được thiết lập cách gọi cho hàng hoá nào. Liên hệ quản trị viên để thiết lập.
            </p>
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Mã</th>
                  <th className="border border-slate-200 px-3 py-2">Tên hàng hoá</th>
                  <th className="border border-slate-200 px-3 py-2">ĐVT</th>
                  <th className="border border-slate-200 px-3 py-2">Cách gọi</th>
                  <th className="border border-slate-200 px-3 py-2">Tồn hiện tại</th>
                  <th className="border border-slate-200 px-3 py-2">Đang về</th>
                  <th className="border border-slate-200 px-3 py-2">SL đề xuất</th>
                  <th className="border border-slate-200 px-3 py-2">SL đặt</th>
                  <th className="border border-slate-200 px-3 py-2">Vì sao</th>
                </tr>
              </thead>
              <tbody>
                {rowsByGroup.map(([groupName, groupRows]) => (
                  <Fragment key={groupName}>
                    <tr className="bg-slate-50">
                      <td colSpan={9} className="border border-slate-200 px-3 py-1.5 text-xs font-semibold uppercase text-slate-600">
                        {groupName}
                      </td>
                    </tr>
                    {groupRows.map((row) => {
                      const qty = finalQty(row);
                      return (
                        <tr key={row.productId} className={row.active ? "" : "text-slate-400"}>
                          <td className="border border-slate-200 px-3 py-2">{row.code}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.name}</td>
                          <td className="border border-slate-200 px-3 py-2">{row.unitLabel}</td>
                          <td className="border border-slate-200 px-3 py-2 text-xs">{REORDER_MODE_LABELS[row.mode]}</td>
                          <td className="border border-slate-200 px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24"
                              // Hàng gọi cố định không nhìn tồn nên không cần ô nhập — đỡ gây hiểu nhầm là bắt buộc.
                              disabled={row.mode === "FIXED" || row.mode === "OFF"}
                              value={stockInputs[row.productId] ?? ""}
                              onChange={(e) => setStockInputs((prev) => ({ ...prev, [row.productId]: e.target.value }))}
                            />
                          </td>
                          <td className="border border-slate-200 px-3 py-2">
                            {row.inTransitQty > 0 ? (
                              <span
                                className={row.mode === "COVERAGE" ? "text-slate-600" : "text-amber-600"}
                                title={
                                  row.mode === "COVERAGE"
                                    ? "Đã trừ khỏi SL đề xuất"
                                    : "Chế độ này không tự trừ — cân nhắc sửa cột SL đặt"
                                }
                              >
                                {formatNumber(row.inTransitQty)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="border border-slate-200 px-3 py-2">
                            {row.suggestedQty > 0 ? (
                              <span className="font-medium text-red-600">{formatNumber(row.suggestedQty)}</span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="border border-slate-200 px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="w-24"
                              value={overrides[row.productId] ?? (row.suggestedQty > 0 ? String(row.suggestedQty) : "")}
                              onChange={(e) => setOverrides((prev) => ({ ...prev, [row.productId]: e.target.value }))}
                            />
                            {qty !== row.suggestedQty && (
                              <span className="ml-1 text-xs text-amber-600">đã sửa</span>
                            )}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 align-top">
                            {row.reasons.length > 0 && (
                              <details className="text-xs text-slate-500">
                                <summary className="flex cursor-pointer items-center gap-1 text-slate-400 hover:text-slate-600">
                                  <Info size={12} />
                                  {row.reasons.length} lý do
                                </summary>
                                <ul className="mt-1 list-disc pl-4">
                                  {row.reasons.map((reason, index) => (
                                    <li key={index}>{reason}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={onSubmit} disabled={commit.isPending}>
          {commit.isPending ? "Đang lưu..." : "Tạo đơn hàng"}
        </Button>
      </div>

      {importOpen && (
        <Modal title="Nhập tồn hiện tại từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Tên hàng hoá*, Tồn hiện tại (cột có dấu * là bắt buộc phải
              điền). Để trống Tồn hiện tại nghĩa là không đặt thêm hàng hoá đó. Chỉ áp dụng cho hàng hoá đã có trong danh sách
              order nhanh của bạn. Sau khi nhập, bấm &quot;Tính lại số lượng&quot;.
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
