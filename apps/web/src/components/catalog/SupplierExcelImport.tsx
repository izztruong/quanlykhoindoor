"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ApiError, api } from "@/lib/api-client";
import type { Supplier } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ParsedSupplier {
  code: string;
  name: string;
  phone?: string;
  address?: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

const TEMPLATE_HEADER = ["Mã NCC*", "Tên nhà cung cấp*", "Điện thoại", "Địa chỉ"];

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

interface SupplierExcelImportProps {
  items: Supplier[];
  search?: string;
}

export function SupplierExcelImport({ items, search }: SupplierExcelImportProps) {
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
    const sheet = workbook.addWorksheet("Nhà cung cấp");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(["NCC001", "Công ty TNHH Ví dụ", "0900000000", "Địa chỉ ví dụ"]);
    await downloadWorkbook(workbook, "mau-nha-cung-cap.xlsx");
  }

  const filteredItems = search?.trim()
    ? items.filter(
        (i) => i.code.toLowerCase().includes(search.trim().toLowerCase()) || i.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : items;

  async function runExport(list: Supplier[]) {
    setExportChoiceOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Nhà cung cấp");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header: header.replace("*", ""), width: 24 }));
    sheet.getRow(1).font = { bold: true };
    for (const item of list) sheet.addRow([item.code, item.name, item.phone ?? "", item.address ?? ""]);
    await downloadWorkbook(workbook, "nha-cung-cap.xlsx");
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

      const parsedItems: ParsedSupplier[] = [];
      const errors: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cell = (col: number) => String(row.getCell(col).value ?? "").trim();
        const code = cell(1);
        const name = cell(2);
        const phone = cell(3);
        const address = cell(4);

        if (!code && !name) return;
        if (!code || !name) {
          errors.push(`Dòng ${rowNumber}: thiếu mã hoặc tên nhà cung cấp`);
          return;
        }
        parsedItems.push({ code, name, phone: phone || undefined, address: address || undefined });
      });

      if (parsedItems.length === 0) {
        setResult({ created: 0, updated: 0, errors: errors.length ? errors : ["Không có dòng dữ liệu hợp lệ trong file."] });
        return;
      }

      const summary = await api.post<{ created: number; updated: number }>("/suppliers/bulk-import", { items: parsedItems });
      queryClient.invalidateQueries({ queryKey: ["catalog", "suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers", "all"] });
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
        <Modal title="Nhập nhà cung cấp từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Mã NCC*, Tên nhà cung cấp*, Điện thoại, Địa chỉ (cột có dấu
              * là bắt buộc phải điền). Mã NCC đã tồn tại sẽ được cập nhật đè.
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
                  Đã thêm mới {result.created}, cập nhật {result.updated} nhà cung cấp.
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
              Bạn đang lọc theo &quot;{search}&quot; ({filteredItems.length} nhà cung cấp khớp). Chọn phạm vi muốn xuất:
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
