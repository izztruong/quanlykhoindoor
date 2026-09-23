"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  useImportShiftExpenses,
  type ShiftExpenseFilter,
  type ShiftExpenseInput,
  type ShiftExpenseListResult,
} from "@/hooks/useShiftExpenses";
import { ApiError, api } from "@/lib/api-client";
import { exportRowsToExcel, sanitizeExcelRow } from "@/lib/excelExport";
import { formatDateOnly, formatDateTime, labels } from "@/lib/format";
import { COL, TEMPLATE_HEADER, headerMatchesTemplate, parseExpenseType, parseNumber, parseSpentAt } from "@/lib/shiftExpenseExcel";
import type { ShiftExpense } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ShiftExpenseExcelActionsProps {
  /** Bộ lọc đang áp trên danh sách — file xuất ra bám đúng bộ lọc này, không phải trang đang xem. */
  filter: ShiftExpenseFilter;
  scopeAll: boolean;
}

interface ImportResult {
  created: number;
  errors: string[];
}

export function ShiftExpenseExcelActions({ filter, scopeAll }: ShiftExpenseExcelActionsProps) {
  const importExpenses = useImportShiftExpenses();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function downloadTemplate() {
    setMenuOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Chi chốt ca");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(sanitizeExcelRow(["01/09/2026", "NVL", "Đá", "túi", 10, 8000, ""]));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-chi-chot-ca.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setMenuOpen(false);
    setExporting(true);
    try {
      // Xuất theo bộ lọc đang áp, không phải 20 dòng của trang đang xem.
      const data = await api.get<ShiftExpenseListResult>("/shift-expenses", { ...filter, page: 1, pageSize: 500 });

      // 7 cột đầu trùng file mẫu để xuất ra rồi nhập ngược lại được; cột thêm phía sau bị phần
      // nhập bỏ qua vì nó chỉ đọc theo COL.
      await exportRowsToExcel<ShiftExpense>(
        "Chi chốt ca",
        [
          { header: "Ngày", value: (row) => formatDateOnly(row.spentAt), width: 14 },
          { header: "Loại chi", value: (row) => labels.shiftExpenseType(row.type), width: 12 },
          { header: "Nội dung chi", value: (row) => row.content, width: 34 },
          { header: "Đơn vị tính", value: (row) => row.unit ?? "", width: 14 },
          { header: "Số lượng", value: (row) => Number(row.quantity), width: 12 },
          { header: "Đơn giá", value: (row) => Number(row.unitPrice), width: 14 },
          { header: "Ghi chú", value: (row) => row.note ?? "", width: 24 },
          { header: "Thành tiền", value: (row) => Number(row.amount), width: 16 },
          ...(scopeAll ? [{ header: "Quán", value: (row: ShiftExpense) => row.createdBy?.name ?? "", width: 20 }] : []),
          // Ba cột cuối chỉ để đọc. Cột 1 vẫn phải là "Ngày" đúng như file mẫu dù giao diện đã đổi
          // nhãn thành "Ngày chi": headerMatchesTemplate so đúng 7 tiêu đề đầu, đổi ở đây là chính
          // file vừa xuất cũng không nhập ngược lại được.
          { header: "Ngày lập phiếu", value: (row: ShiftExpense) => formatDateTime(row.createdAt), width: 18 },
          { header: "Đã chi", value: (row: ShiftExpense) => (row.paidAt ? "Đã chi" : ""), width: 10 },
          { header: "Người đánh dấu", value: (row: ShiftExpense) => row.paidBy?.name ?? "", width: 20 },
        ],
        data.items,
        "chi-chot-ca.xlsx",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setResult({ created: 0, errors: ["Không đọc được sheet nào trong file."] });
        return;
      }

      // Kiểm hàng tiêu đề TRƯỚC khi đọc dòng nào: bố cục cột lệch mà cứ đọc thì số lượng và đơn
      // giá đổi chỗ cho nhau, dữ liệu vào êm ru nhưng sai hết.
      const actualHeader = TEMPLATE_HEADER.map((_, i) => sheet.getRow(1).getCell(i + 1).text);
      if (!headerMatchesTemplate(actualHeader)) {
        setResult({
          created: 0,
          errors: [`Tiêu đề cột không khớp file mẫu. Cần đúng thứ tự: ${TEMPLATE_HEADER.join(", ")}.`],
        });
        return;
      }

      const items: ShiftExpenseInput[] = [];
      const errors: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const text = (col: number) => String(row.getCell(col).text ?? "").trim();
        const raw = (col: number) => row.getCell(col).value;

        const content = text(COL.content);
        const dateText = text(COL.spentAt);
        const typeText = text(COL.type);
        const quantityText = text(COL.quantity);
        const unitPriceText = text(COL.unitPrice);

        // Dòng trống hoàn toàn thì bỏ qua, không tính là lỗi.
        if (!content && !dateText && !typeText && !quantityText && !unitPriceText) return;

        const spentAt = parseSpentAt(raw(COL.spentAt), dateText);
        const type = parseExpenseType(typeText);
        const quantity = parseNumber(raw(COL.quantity), quantityText);
        const unitPrice = parseNumber(raw(COL.unitPrice), unitPriceText);

        if (!spentAt) errors.push(`Dòng ${rowNumber}: ngày không hợp lệ ("${dateText}")`);
        if (!content) errors.push(`Dòng ${rowNumber}: thiếu nội dung chi`);
        if (!type) errors.push(`Dòng ${rowNumber}: loại chi phải là NVL hoặc Khác ("${typeText}")`);
        if (quantity === null || quantity <= 0) errors.push(`Dòng ${rowNumber}: số lượng không hợp lệ ("${quantityText}")`);
        if (unitPrice === null || unitPrice < 0) errors.push(`Dòng ${rowNumber}: đơn giá không hợp lệ ("${unitPriceText}")`);
        if (!spentAt || !content || !type || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0) return;

        items.push({
          spentAt,
          type,
          content,
          unit: text(COL.unit) || undefined,
          quantity,
          unitPrice,
          note: text(COL.note) || undefined,
        });
      });

      // Có lỗi thì không gửi gì cả: nhập nửa file rồi phải tự dò xem dòng nào đã vào còn khổ hơn.
      if (errors.length > 0) {
        setResult({ created: 0, errors });
        return;
      }
      if (items.length === 0) {
        setResult({ created: 0, errors: ["File không có dòng dữ liệu nào."] });
        return;
      }

      const summary = await importExpenses.mutateAsync(items);
      setResult({ created: summary.created, errors: [] });
    } catch (err) {
      setResult({
        created: 0,
        errors: [err instanceof ApiError ? err.message : "Đọc file thất bại. Vui lòng kiểm tra định dạng file."],
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button type="button" variant="secondary" onClick={() => setMenuOpen((o) => !o)} disabled={exporting}>
          Nhập &amp; xuất excel
          <ChevronDown size={16} />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={downloadTemplate}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Tải file mẫu
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setResult(null);
                setImportOpen(true);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Nhập dữ liệu
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Xuất dữ liệu
            </button>
          </div>
        )}
      </div>

      {importOpen && (
        <Modal title="Nhập chi chốt ca từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: {TEMPLATE_HEADER.join(", ")} (cột có dấu * là bắt buộc).
              Ngày ghi dạng 1/9 hoặc 06/09/2026 đều được.
            </p>
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Nhập Excel luôn <strong>thêm dòng mới</strong>, không ghi đè dòng cũ — nhập lại cùng một file sẽ tạo thêm một
              bộ dòng nữa.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleFileChange} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {result && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                {result.errors.length === 0 ? (
                  <p className="font-medium text-slate-700">Đã thêm {result.created} khoản chi.</p>
                ) : (
                  <div>
                    <p className="font-medium text-red-600">
                      Chưa nhập dòng nào — sửa {result.errors.length} lỗi sau rồi thử lại:
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-red-600">
                      {result.errors.map((message, index) => (
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
    </>
  );
}
