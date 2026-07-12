"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProducts } from "@/hooks/useCatalog";
import { useReorderThresholds, useSaveReorderThresholds } from "@/hooks/useReorderThresholds";
import { useUsers } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import type { Product } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface RowInput {
  min: string;
  max: string;
}

export default function ReorderThresholdsPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [] } = useUsers();
  const { data: products = [] } = useProducts();
  const [userId, setUserId] = useState("");
  const { data: thresholds = [] } = useReorderThresholds(userId || undefined);
  const saveThresholds = useSaveReorderThresholds();
  const [search, setSearch] = useState("");
  const filteredProducts = search.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;
  // Only holds fields the admin has actually touched this session; unedited
  // rows fall back to the value already saved on the server (see valueFor).
  const [overrides, setOverrides] = useState<Record<string, RowInput>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  const savedByProductId = new Map(thresholds.map((t) => [t.productId, t]));

  function valueFor(productId: string, field: "min" | "max"): string {
    const override = overrides[productId]?.[field];
    if (override !== undefined) return override;
    const saved = savedByProductId.get(productId);
    if (!saved) return "";
    return String(field === "min" ? saved.minQuantity : saved.maxQuantity);
  }

  function selectUser(id: string) {
    setUserId(id);
    setOverrides({});
    setSaved(false);
  }

  function setRow(productId: string, field: "min" | "max", value: string) {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
  }

  function onSave() {
    if (!userId) return;
    setError(null);
    setSaved(false);

    // Only send rows actually touched this session (see overrides above) -
    // re-sending every product's already-saved value was redundant and, at
    // full catalog size, slow enough to blow past the save timeout.
    const validProductIds = new Set(products.map((p) => p.id));
    const items = Object.keys(overrides)
      .filter((productId) => validProductIds.has(productId))
      .map((productId) => {
        const min = valueFor(productId, "min").trim();
        const max = valueFor(productId, "max").trim();
        return { productId, minQuantity: min ? Number(min) : null, maxQuantity: max ? Number(max) : null };
      });

    if (items.length === 0) {
      setSaved(true);
      setOverrides({});
      return;
    }

    saveThresholds.mutate(
      { userId, items },
      {
        onSuccess: () => {
          setSaved(true);
          setOverrides({});
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu định lượng thất bại"),
      },
    );
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Định lượng");
    sheet.columns = ["Mã hàng hoá*", "Tối thiểu", "Tối đa"].map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([products[0]?.code ?? "SP001", 0, 0]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-dinh-luong.xlsx";
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
        const minRaw = row.getCell(2).value;
        const maxRaw = row.getCell(3).value;
        if (!code) return;

        const product = productByCode.get(code.toLowerCase());
        if (!product) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy hàng hoá có mã "${code}"`);
          return;
        }

        const min = minRaw === null || minRaw === undefined || minRaw === "" ? "" : String(Number(minRaw));
        const max = maxRaw === null || maxRaw === undefined || maxRaw === "" ? "" : String(Number(maxRaw));
        if ((min && Number.isNaN(Number(min))) || (max && Number.isNaN(Number(max)))) {
          errors.push(`Dòng ${rowNumber}: định lượng không hợp lệ`);
          return;
        }
        if (min && max && Number(max) < Number(min)) {
          errors.push(`Dòng ${rowNumber}: định lượng tối đa phải >= tối thiểu`);
          return;
        }

        nextOverrides[product.id] = { min, max };
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
      { header: "Tối thiểu", value: (p) => valueFor(p.id, "min") },
      { header: "Tối đa", value: (p) => valueFor(p.id, "max") },
    ];
    await exportRowsToExcel("Định lượng", columns, products, "dinh-luong-order-nhanh.xlsx");
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
        <h1 className="text-xl font-semibold text-slate-800">Định lượng Order nhanh</h1>
        <p className="text-sm text-slate-500">
          Thiết lập định lượng tối thiểu / tối đa cho từng hàng hoá theo từng tài khoản. Mỗi tài khoản có thể có định lượng
          khác nhau.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Tài khoản</label>
            <Select value={userId} onChange={(e) => selectUser(e.target.value)}>
              <option value="">Chọn tài khoản</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      {userId && (
        <Card>
          <CardHeader>
            <CardTitle>Định lượng hàng hoá</CardTitle>
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
                  <th className="py-2 pr-3">Tối thiểu</th>
                  <th className="py-2 pr-3">Tối đa</th>
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
                        className="w-28"
                        value={valueFor(p.id, "min")}
                        onChange={(e) => setRow(p.id, "min", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        className="w-28"
                        value={valueFor(p.id, "max")}
                        onChange={(e) => setRow(p.id, "max", e.target.value)}
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
      {saved && !error && <p className="text-sm text-green-600">Đã lưu định lượng.</p>}

      {userId && (
        <div className="flex justify-end gap-2">
          <Button onClick={onSave} disabled={saveThresholds.isPending}>
            {saveThresholds.isPending ? "Đang lưu..." : "Lưu định lượng"}
          </Button>
        </div>
      )}

      {importOpen && (
        <Modal title="Nhập định lượng từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Mã hàng hoá*, Tối thiểu, Tối đa (cột có dấu * là bắt buộc
              phải điền; để trống Tối thiểu/Tối đa nghĩa là xoá định lượng của hàng hoá đó). Dữ liệu chỉ được áp dụng cho tài
              khoản đang chọn, cần bấm &quot;Lưu định lượng&quot; để lưu lại.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">Đã cập nhật định lượng cho {importResult.updated} hàng hoá.</p>
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
