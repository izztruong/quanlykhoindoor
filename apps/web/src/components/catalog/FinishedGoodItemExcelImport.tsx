"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useUnits } from "@/hooks/useCatalog";
import { ApiError, api } from "@/lib/api-client";
import { sanitizeExcelRow } from "@/lib/excelExport";
import { parseNumber } from "@/lib/excelParse";
import { FINISHED_GOOD_CATEGORY_OPTIONS, labels } from "@/lib/format";
import type { FinishedGoodItem } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ParsedItem {
  code: string;
  name: string;
  unitId: string;
  category?: string;
  sellingPrice?: number;
  vatPercent?: number | null;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

/**
 * MỘT nguồn duy nhất cho thứ tự cột — mẫu trắng, file xuất và phần đọc đều suy ra từ đây.
 *
 * **Cột mới phải thêm vào CUỐI**: phần nhập này không kiểm hàng tiêu đề, nên chèn vào giữa là file
 * người dùng đã xuất trước đó bị đọc lệch cột mà không báo gì.
 */
const COLUMNS = [
  { key: "code", label: "Mã*" },
  { key: "name", label: "Tên đồ thành phẩm*" },
  { key: "unit", label: "Đơn vị tính*" },
  { key: "category", label: "Nhóm" },
  { key: "sellingPrice", label: "Giá bán" },
  { key: "vatPercent", label: "VAT (%)" },
] as const;

const TEMPLATE_HEADER = COLUMNS.map((c) => c.label);
/** Số thứ tự cột trong sheet (1-based) theo khoá. */
const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i + 1])) as Record<(typeof COLUMNS)[number]["key"], number>;

const categoryValueByLabel = new Map(FINISHED_GOOD_CATEGORY_OPTIONS.map((o) => [o.label.toLowerCase(), o.value]));

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

interface FinishedGoodItemExcelImportProps {
  items: FinishedGoodItem[];
  search?: string;
}

export function FinishedGoodItemExcelImport({ items, search }: FinishedGoodItemExcelImportProps) {
  const queryClient = useQueryClient();
  const { data: units = [] } = useUnits();

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
    const sheet = workbook.addWorksheet("Đồ thành phẩm");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 26 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(sanitizeExcelRow(["TP001", "Cà phê ủ", units[0]?.name ?? "Gam", "Trà", 25000, 8]));
    await downloadWorkbook(workbook, "mau-do-thanh-pham.xlsx");
  }

  const filteredItems = search?.trim()
    ? items.filter(
        (i) => i.code.toLowerCase().includes(search.trim().toLowerCase()) || i.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : items;

  async function runExport(list: FinishedGoodItem[]) {
    setExportChoiceOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Đồ thành phẩm");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header: header.replace("*", ""), width: 26 }));
    sheet.getRow(1).font = { bold: true };
    for (const item of list)
      sheet.addRow(
        sanitizeExcelRow([
          item.code,
          item.name,
          item.unit?.name ?? "-",
          item.category ? labels.finishedGoodCategory(item.category) : "",
          item.sellingPrice != null ? Number(item.sellingPrice) : "",
          item.vatPercent != null ? Number(item.vatPercent) : "",
        ]),
      );
    await downloadWorkbook(workbook, "do-thanh-pham.xlsx");
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

      const unitByName = new Map(units.map((u) => [u.name.trim().toLowerCase(), u.id]));
      const parsedItems: ParsedItem[] = [];
      const errors: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cell = (col: number) => String(row.getCell(col).value ?? "").trim();
        const code = cell(COL.code);
        const name = cell(COL.name);
        const unitName = cell(COL.unit);
        const categoryLabel = cell(COL.category);
        const sellingPriceRaw = row.getCell(COL.sellingPrice).value;
        const vatCell = row.getCell(COL.vatPercent);
        const vatText = cell(COL.vatPercent);

        if (!code && !name) return;
        if (!code || !name) {
          errors.push(`Dòng ${rowNumber}: thiếu mã hoặc tên đồ thành phẩm`);
          return;
        }

        const unitId = unitByName.get(unitName.toLowerCase());
        if (!unitId) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy đơn vị tính "${unitName}"`);
          return;
        }

        let category: string | undefined;
        if (categoryLabel) {
          category = categoryValueByLabel.get(categoryLabel.toLowerCase());
          if (!category) {
            errors.push(`Dòng ${rowNumber}: không nhận ra nhóm "${categoryLabel}"`);
            return;
          }
        }

        // Ô trống gửi `null` (gỡ VAT về chưa khai), không phải `undefined` (không sửa) — file xuất
        // từ bản cũ không có cột này nên ô trống là trạng thái bình thường.
        let vatPercent: number | null = null;
        if (vatText !== "") {
          const parsed = parseNumber(vatCell.value, vatText);
          if (parsed === null || parsed < 0 || parsed > 999.99) {
            errors.push(`Dòng ${rowNumber}: VAT (%) không đọc được hoặc ngoài khoảng 0–999,99 ("${vatText}")`);
            return;
          }
          vatPercent = parsed;
        }

        parsedItems.push({
          code,
          name,
          unitId,
          category,
          vatPercent,
          sellingPrice: sellingPriceRaw !== null && sellingPriceRaw !== undefined && sellingPriceRaw !== "" ? Number(sellingPriceRaw) : undefined,
        });
      });

      if (parsedItems.length === 0) {
        setResult({ created: 0, updated: 0, errors: errors.length ? errors : ["Không có dòng dữ liệu hợp lệ trong file."] });
        return;
      }

      const summary = await api.post<{ created: number; updated: number }>("/finished-good-items/bulk-import", {
        items: parsedItems,
      });
      queryClient.invalidateQueries({ queryKey: ["catalog", "finished-good-items"] });
      queryClient.invalidateQueries({ queryKey: ["finished-good-items", "all"] });
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
        <Modal title="Nhập đồ thành phẩm từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: {TEMPLATE_HEADER.join(", ")} (cột có dấu * là bắt buộc
              phải điền). Mã đã tồn tại sẽ được cập nhật đè; dòng có đơn vị tính chưa khai báo hoặc nhóm không nhận ra
              trong hệ thống sẽ bị bỏ qua và báo lỗi.
            </p>
            <p className="text-sm text-slate-600">
              <strong>VAT (%)</strong> điền số phần trăm, ví dụ <code>8</code> hoặc <code>10</code> — không điền
              <code> 0,08</code>. Để trống nghĩa là chưa khai và Check Cost coi như 0%; cột này chỉ có tác dụng với phiếu
              Check Cost lập khi bật &quot;Dùng VAT&quot;. File xuất từ bản cũ chưa có cột này vẫn nhập được bình thường.
            </p>
            <p className="text-sm text-slate-600">
              <strong>Cách ghi số</strong>: ô số thật thì điền thẳng. Ô dạng chữ đọc theo kiểu máy — dấu chấm là thập
              phân và không có phân cách nghìn, nên <code>1.5</code> là 1,5 còn <code>8.000</code> là 8. Dấu phẩy cũng
              được nhận (<code>0,5</code>). Ô nhập nhằng như <code>8.000.000</code> hay <code>1.234,5</code> sẽ báo lỗi
              đúng dòng thay vì đoán.
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
                  Đã thêm mới {result.created}, cập nhật {result.updated} đồ thành phẩm.
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
              Bạn đang lọc theo &quot;{search}&quot; ({filteredItems.length} đồ thành phẩm khớp). Chọn phạm vi muốn xuất:
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
