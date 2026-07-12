"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers } from "@/hooks/useCatalog";
import { useProductSupplierPrices, useSaveProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import type { Product } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface RowInput {
  importPrice: string;
  exportPrice: string;
}

export default function ProductSupplierPricesPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts();
  const [supplierId, setSupplierId] = useState("");
  const { data: prices = [] } = useProductSupplierPrices(supplierId || undefined);
  const savePrices = useSaveProductSupplierPrices();
  // Only holds fields the admin has actually touched this session; unedited
  // rows fall back to the value already saved on the server (see valueFor).
  const [overrides, setOverrides] = useState<Record<string, RowInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");
  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

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

  const savedByProductId = new Map(prices.map((p) => [p.productId, p]));

  function valueFor(productId: string, field: "importPrice" | "exportPrice"): string {
    const override = overrides[productId]?.[field];
    if (override !== undefined) return override;
    const saved = savedByProductId.get(productId);
    if (!saved) return "";
    return String(field === "importPrice" ? saved.importPrice : saved.exportPrice);
  }

  function selectSupplier(id: string) {
    setSupplierId(id);
    setOverrides({});
    setSaved(false);
  }

  function setRow(productId: string, field: "importPrice" | "exportPrice", value: string) {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
  }

  function onSave() {
    if (!supplierId) return;
    setError(null);
    setSaved(false);
    const items = products.map((p) => {
      const importPrice = valueFor(p.id, "importPrice").trim();
      const exportPrice = valueFor(p.id, "exportPrice").trim();
      return {
        productId: p.id,
        importPrice: importPrice ? Number(importPrice) : null,
        exportPrice: exportPrice ? Number(exportPrice) : null,
      };
    });
    savePrices.mutate(
      { supplierId, items },
      {
        onSuccess: () => {
          setSaved(true);
          setOverrides({});
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu giá thất bại"),
      },
    );
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Giá theo NCC");
    sheet.columns = ["Mã hàng hoá*", "Giá nhập", "Giá xuất"].map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([products[0]?.code ?? "SP001", 0, 0]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-gia-theo-ncc.xlsx";
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

      const productByCode = new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
      const errors: string[] = [];
      let updated = 0;
      const nextOverrides = { ...overrides };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(1).value ?? "").trim();
        const importRaw = row.getCell(2).value;
        const exportRaw = row.getCell(3).value;
        if (!code) return;

        const product = productByCode.get(code.toLowerCase());
        if (!product) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy hàng hoá có mã "${code}"`);
          return;
        }

        const importPrice = importRaw === null || importRaw === undefined || importRaw === "" ? "" : String(Number(importRaw));
        const exportPrice = exportRaw === null || exportRaw === undefined || exportRaw === "" ? "" : String(Number(exportRaw));
        if ((importPrice && Number.isNaN(Number(importPrice))) || (exportPrice && Number.isNaN(Number(exportPrice)))) {
          errors.push(`Dòng ${rowNumber}: giá không hợp lệ`);
          return;
        }

        nextOverrides[product.id] = { importPrice, exportPrice };
        updated++;
      });

      setOverrides(nextOverrides);
      setSaved(false);
      setImportResult({ updated, errors });
    } catch {
      setImportResult({ updated: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  async function exportData() {
    setExcelMenuOpen(false);
    const columns: ExcelColumn<Product>[] = [
      { header: "Mã hàng hoá", value: (p) => p.code },
      { header: "Tên hàng hoá", value: (p) => p.name },
      { header: "ĐVT", value: (p) => p.unit?.name ?? "-" },
      { header: "Giá nhập", value: (p) => valueFor(p.id, "importPrice") },
      { header: "Giá xuất", value: (p) => valueFor(p.id, "exportPrice") },
    ];
    await exportRowsToExcel("Giá theo NCC", columns, products, "gia-theo-ncc.xlsx");
  }

  if (currentUser && currentUser.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Giá theo Nhà cung cấp</h1>
        <p className="text-sm text-slate-500">
          Thiết lập giá nhập / giá xuất cho từng hàng hoá theo từng nhà cung cấp. Một hàng hoá có thể có giá khác nhau ở mỗi
          NCC; để trống nghĩa là hàng hoá đó không lấy từ NCC này.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Nhà cung cấp</label>
            <Select value={supplierId} onChange={(e) => selectSupplier(e.target.value)}>
              <option value="">Chọn nhà cung cấp</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {supplierId && (
        <Card>
          <CardHeader>
            <CardTitle>Giá hàng hoá</CardTitle>
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
          </CardHeader>
          <CardBody className="flex flex-col gap-3 overflow-x-auto">
            <Input
              placeholder="Tìm kiếm theo tên hàng hoá..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-3">Mã</th>
                  <th className="py-2 pr-3">Tên hàng hoá</th>
                  <th className="py-2 pr-3">ĐVT</th>
                  <th className="py-2 pr-3">Giá nhập</th>
                  <th className="py-2 pr-3">Giá xuất</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{p.code}</td>
                    <td className="py-2 pr-3">{p.name}</td>
                    <td className="py-2 pr-3">{p.unit?.name}</td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        className="w-32"
                        value={valueFor(p.id, "importPrice")}
                        onChange={(e) => setRow(p.id, "importPrice", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        className="w-32"
                        value={valueFor(p.id, "exportPrice")}
                        onChange={(e) => setRow(p.id, "exportPrice", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Đã lưu giá.</p>}

      {supplierId && (
        <div className="flex justify-end gap-2">
          <Button onClick={onSave} disabled={savePrices.isPending}>
            {savePrices.isPending ? "Đang lưu..." : "Lưu giá"}
          </Button>
        </div>
      )}

      {importOpen && (
        <Modal title="Nhập giá từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Mã hàng hoá*, Giá nhập, Giá xuất (cột có dấu * là bắt buộc
              phải điền; để trống Giá nhập/Giá xuất nghĩa là xoá giá của hàng hoá đó cho NCC này). Dữ liệu chỉ được áp dụng cho
              NCC đang chọn, cần bấm &quot;Lưu giá&quot; để lưu lại.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">Đã cập nhật giá cho {importResult.updated} hàng hoá.</p>
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
