"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useProductGroups, useProducts, useUnits } from "@/hooks/useCatalog";
import { ApiError, api } from "@/lib/api-client";
import { PRODUCT_TYPE_OPTIONS, labels } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TEMPLATE_HEADER = [
  "Mã hàng hoá*",
  "Tên hàng hoá*",
  "Đơn vị tính*",
  "Nhóm hàng hoá*",
  "Loại hàng hoá",
  "Giá vốn",
  "Đơn vị công thức",
  "Quy đổi (1 đơn vị chính = ? đơn vị công thức)",
  "Khối lượng vỏ (theo đơn vị công thức)",
  "Ghi chú",
];

const typeValueByLabel = new Map(PRODUCT_TYPE_OPTIONS.map((o) => [o.label.toLowerCase(), o.value]));

interface ParsedItem {
  code: string;
  name: string;
  unitId: string;
  productGroupId: string;
  type: string;
  costPrice: number;
  recipeUnitId?: string;
  recipeUnitsPerBaseUnit?: number;
  tareWeight?: number;
  note?: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
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

interface ProductExcelImportProps {
  /** Current search text applied to the catalog table, if any (for the "export filtered" choice). */
  search?: string;
}

export function ProductExcelImport({ search }: ProductExcelImportProps) {
  const queryClient = useQueryClient();
  const { data: units = [] } = useUnits();
  const { data: productGroups = [] } = useProductGroups();
  const { data: products = [] } = useProducts();

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
    const sheet = workbook.addWorksheet("Hàng hoá");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      "SP001",
      "Cà phê hạt",
      units[0]?.name ?? "Kg",
      productGroups[0]?.name ?? "COFFEE",
      "Nguyên vật liệu",
      100000,
      "Gram",
      1000,
      0,
      "",
    ]);
    await downloadWorkbook(workbook, "mau-hang-hoa.xlsx");
  }

  const filteredProducts = search?.trim()
    ? products.filter((p) => p.code.toLowerCase().includes(search.trim().toLowerCase()) || p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  async function runExport(list: typeof products) {
    setExportChoiceOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Hàng hoá");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header: header.replace("*", ""), width: 22 }));
    sheet.getRow(1).font = { bold: true };
    for (const product of list) {
      sheet.addRow([
        product.code,
        product.name,
        product.unit?.name ?? "-",
        product.productGroup?.name ?? "-",
        labels.productType(product.type),
        Number(product.costPrice) || 0,
        product.recipeUnit?.name ?? "",
        product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : "",
        product.tareWeight != null ? Number(product.tareWeight) : "",
        product.note ?? "",
      ]);
    }
    await downloadWorkbook(workbook, "danh-sach-hang-hoa.xlsx");
  }

  function handleExportClick() {
    setMenuOpen(false);
    if (!search?.trim()) {
      runExport(products);
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
      const groupByName = new Map(productGroups.map((g) => [g.name.trim().toLowerCase(), g.id]));

      const items: ParsedItem[] = [];
      const errors: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const cell = (col: number) => String(row.getCell(col).value ?? "").trim();
        const code = cell(1);
        const name = cell(2);
        const unitName = cell(3);
        const groupName = cell(4);
        const typeLabel = cell(5);
        const costPriceRaw = row.getCell(6).value;
        const recipeUnitName = cell(7);
        const recipeUnitsPerBaseUnitRaw = row.getCell(8).value;
        const tareWeightRaw = row.getCell(9).value;
        const note = cell(10);

        if (!code && !name) return;

        if (!code || !name) {
          errors.push(`Dòng ${rowNumber}: thiếu mã hoặc tên hàng hoá`);
          return;
        }

        const unitId = unitByName.get(unitName.toLowerCase());
        if (!unitId) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy đơn vị tính "${unitName}"`);
          return;
        }

        const productGroupId = groupByName.get(groupName.toLowerCase());
        if (!productGroupId) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy nhóm hàng hoá "${groupName}"`);
          return;
        }

        let type = "NVL";
        if (typeLabel) {
          const found = typeValueByLabel.get(typeLabel.toLowerCase());
          if (!found) {
            errors.push(`Dòng ${rowNumber}: không nhận ra loại hàng hoá "${typeLabel}"`);
            return;
          }
          type = found;
        }

        let recipeUnitId: string | undefined;
        if (recipeUnitName) {
          recipeUnitId = unitByName.get(recipeUnitName.toLowerCase());
          if (!recipeUnitId) {
            errors.push(`Dòng ${rowNumber}: không tìm thấy đơn vị công thức "${recipeUnitName}"`);
            return;
          }
        }

        items.push({
          code,
          name,
          unitId,
          productGroupId,
          type,
          costPrice: Number(costPriceRaw) || 0,
          recipeUnitId,
          recipeUnitsPerBaseUnit:
            recipeUnitsPerBaseUnitRaw !== null && recipeUnitsPerBaseUnitRaw !== undefined && recipeUnitsPerBaseUnitRaw !== ""
              ? Number(recipeUnitsPerBaseUnitRaw)
              : undefined,
          tareWeight: tareWeightRaw !== null && tareWeightRaw !== undefined && tareWeightRaw !== "" ? Number(tareWeightRaw) : undefined,
          note: note || undefined,
        });
      });

      if (items.length === 0) {
        setResult({ created: 0, updated: 0, errors: errors.length ? errors : ["Không có dòng dữ liệu hợp lệ trong file."] });
        return;
      }

      const summary = await api.post<{ created: number; updated: number }>("/products/bulk-import", { items });
      queryClient.invalidateQueries({ queryKey: ["catalog", "products"] });
      queryClient.invalidateQueries({ queryKey: ["products", "all"] });
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
        <Modal title="Nhập hàng hoá từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Mã hàng hoá*, Tên hàng hoá*, Đơn vị tính*, Nhóm hàng hoá*,
              Loại hàng hoá, Giá vốn, Đơn vị công thức, Quy đổi, Khối lượng vỏ, Ghi chú (cột có dấu * là bắt buộc phải điền).
              Mã đã tồn tại sẽ được cập nhật đè; dòng có đơn vị tính, nhóm hàng hoá, loại hàng hoá hoặc đơn vị công thức chưa
              khai báo/không nhận ra trong hệ thống sẽ bị bỏ qua và báo lỗi. Bỏ trống "Loại hàng hoá" sẽ mặc định là Nguyên vật
              liệu.
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
                  Đã thêm mới {result.created}, cập nhật {result.updated} hàng hoá.
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
              Bạn đang lọc theo &quot;{search}&quot; ({filteredProducts.length} hàng hoá khớp). Chọn phạm vi muốn xuất:
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => runExport(products)}>
                Xuất tất cả ({products.length})
              </Button>
              <Button type="button" onClick={() => runExport(filteredProducts)}>
                Xuất theo bộ lọc ({filteredProducts.length})
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
