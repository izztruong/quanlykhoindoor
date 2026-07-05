"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SimpleItem {
  code: string;
  name: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

interface SimpleCodeNameExcelActionsProps {
  /** Used in the sheet/tab name and error copy, e.g. "nhóm hàng hoá". */
  entityLabel: string;
  codeLabel: string;
  nameLabel: string;
  /** Base REST endpoint, e.g. "/product-groups" — bulk-import posts to `${endpoint}/bulk-import`. */
  endpoint: string;
  /** react-query cache key used by useCatalog's list hook and CatalogPage, e.g. "product-groups". */
  queryKey: string;
  /** Full current list (not just the current page), used for the export file. */
  items: SimpleItem[];
  /** Used to name the downloaded files, e.g. "nhom-hang-hoa". */
  fileBaseName: string;
  /** Current search text applied to the catalog table, if any (for the "export filtered" choice). */
  search?: string;
}

function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });
}

export function SimpleCodeNameExcelActions({
  entityLabel,
  codeLabel,
  nameLabel,
  endpoint,
  queryKey,
  items,
  fileBaseName,
  search,
}: SimpleCodeNameExcelActionsProps) {
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [exportChoiceOpen, setExportChoiceOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(entityLabel);
    sheet.columns = [`${codeLabel}*`, `${nameLabel}*`].map((header) => ({ header, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(["VD001", "Ví dụ"]);
    await downloadWorkbook(workbook, `mau-${fileBaseName}.xlsx`);
  }

  const filteredItems = search?.trim()
    ? items.filter((i) => i.code.toLowerCase().includes(search.trim().toLowerCase()) || i.name.toLowerCase().includes(search.trim().toLowerCase()))
    : items;

  async function runExport(list: SimpleItem[]) {
    setExportChoiceOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(entityLabel);
    sheet.columns = [codeLabel, nameLabel].map((header) => ({ header, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    for (const item of list) sheet.addRow([item.code, item.name]);
    await downloadWorkbook(workbook, `${fileBaseName}.xlsx`);
  }

  function handleExportClick() {
    setMenuOpen(false);
    if (!search?.trim()) {
      runExport(items);
      return;
    }
    setExportChoiceOpen(true);
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
        setResult({ created: 0, updated: 0, errors: ["Không đọc được sheet nào trong file."] });
        return;
      }

      const parsedItems: SimpleItem[] = [];
      const errors: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cell = (col: number) => String(row.getCell(col).value ?? "").trim();
        const code = cell(1);
        const name = cell(2);

        if (!code && !name) return;
        if (!code || !name) {
          errors.push(`Dòng ${rowNumber}: thiếu ${codeLabel.toLowerCase()} hoặc ${nameLabel.toLowerCase()}`);
          return;
        }
        parsedItems.push({ code, name });
      });

      if (parsedItems.length === 0) {
        setResult({ created: 0, updated: 0, errors: errors.length ? errors : ["Không có dòng dữ liệu hợp lệ trong file."] });
        return;
      }

      const summary = await api.post<{ created: number; updated: number }>(`${endpoint}/bulk-import`, { items: parsedItems });
      queryClient.invalidateQueries({ queryKey: ["catalog", queryKey] });
      queryClient.invalidateQueries({ queryKey: [queryKey, "all"] });
      setResult({ ...summary, errors });
    } catch (err) {
      setResult({ created: 0, updated: 0, errors: [err instanceof ApiError ? err.message : "Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button type="button" variant="secondary" onClick={() => setMenuOpen((o) => !o)}>
          Nhập & xuất excel
          <ChevronDown size={16} />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
            <button type="button" onClick={handleExportClick} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
              Xuất dữ liệu
            </button>
          </div>
        )}
      </div>

      {importOpen && (
        <Modal title={`Nhập ${entityLabel} từ Excel`} onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: {codeLabel}*, {nameLabel}* (cột có dấu * là bắt buộc phải
              điền). {codeLabel} đã tồn tại sẽ được cập nhật đè.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleFileChange} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {result && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">
                  Đã thêm mới {result.created}, cập nhật {result.updated} {entityLabel}.
                </p>
                {result.errors.length > 0 && (
                  <div>
                    <p className="font-medium text-red-600">Bỏ qua {result.errors.length} dòng lỗi:</p>
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

      {exportChoiceOpen && (
        <Modal title="Xuất dữ liệu" onClose={() => setExportChoiceOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Bạn đang lọc theo &quot;{search}&quot; ({filteredItems.length} {entityLabel} khớp). Chọn phạm vi muốn xuất:
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => runExport(items)}>
                Xuất tất cả ({items.length})
              </Button>
              <Button type="button" onClick={() => runExport(filteredItems)}>
                Xuất theo bộ lọc ({filteredItems.length})
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
