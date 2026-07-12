"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateStockCheck } from "@/hooks/useStockChecks";
import { ApiError } from "@/lib/api-client";
import type { FinishedGoodItem, Product } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface MaterialRow {
  productId: string;
  product: Product;
  wholeQuantity: string;
  looseQuantity: string;
  note: string;
}

interface FinishedRow {
  finishedGoodItemId: string;
  item: FinishedGoodItem;
  quantity: string;
  note: string;
}

const TEMPLATE_HEADER = ["Tên NL*", "Đơn vị", "SL chẵn", "SL lẻ (gam)", "Tên đồ thành phẩm*", "Đơn vị kiểm", "Số lượng"];

export default function NewStockCheckPage() {
  const router = useRouter();
  const { data: products = [] } = useProducts();
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createCheck = useCreateStockCheck();

  const [note, setNote] = useState("");
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>([]);
  const [finishedRows, setFinishedRows] = useState<FinishedRow[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [finishedSearch, setFinishedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const excelMenuRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; added: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!excelMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (excelMenuRef.current && !excelMenuRef.current.contains(e.target as Node)) setExcelMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [excelMenuOpen]);

  const materialRowIds = useMemo(() => new Set(materialRows.map((r) => r.productId)), [materialRows]);
  const materialSuggestions = useMemo(() => {
    if (!materialSearch.trim()) return [];
    const q = materialSearch.trim().toLowerCase();
    return products
      .filter((p) => !materialRowIds.has(p.id) && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [materialSearch, products, materialRowIds]);

  const finishedRowIds = useMemo(() => new Set(finishedRows.map((r) => r.finishedGoodItemId)), [finishedRows]);
  const finishedSuggestions = useMemo(() => {
    if (!finishedSearch.trim()) return [];
    const q = finishedSearch.trim().toLowerCase();
    return finishedGoodItems
      .filter((f) => !finishedRowIds.has(f.id) && (f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [finishedSearch, finishedGoodItems, finishedRowIds]);

  function addMaterialRow(product: Product) {
    setMaterialRows((prev) =>
      prev.some((r) => r.productId === product.id)
        ? prev
        : [...prev, { productId: product.id, product, wholeQuantity: "", looseQuantity: "", note: "" }],
    );
  }

  function updateMaterialRow(productId: string, patch: Partial<MaterialRow>) {
    setMaterialRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  }

  function removeMaterialRow(productId: string) {
    setMaterialRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  function addFinishedRow(item: FinishedGoodItem) {
    setFinishedRows((prev) =>
      prev.some((r) => r.finishedGoodItemId === item.id) ? prev : [...prev, { finishedGoodItemId: item.id, item, quantity: "", note: "" }],
    );
  }

  function updateFinishedRow(finishedGoodItemId: string, patch: Partial<FinishedRow>) {
    setFinishedRows((prev) => prev.map((r) => (r.finishedGoodItemId === finishedGoodItemId ? { ...r, ...patch } : r)));
  }

  function removeFinishedRow(finishedGoodItemId: string) {
    setFinishedRows((prev) => prev.filter((r) => r.finishedGoodItemId !== finishedGoodItemId));
  }

  function handleMaterialSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && materialSuggestions.length > 0) {
      e.preventDefault();
      addMaterialRow(materialSuggestions[0]);
      setMaterialSearch("");
    }
  }

  function handleFinishedSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && finishedSuggestions.length > 0) {
      e.preventDefault();
      addFinishedRow(finishedSuggestions[0]);
      setFinishedSearch("");
    }
  }

  function handleSubmit() {
    setError(null);
    const items = materialRows
      .filter((r) => r.wholeQuantity !== "" || r.looseQuantity !== "")
      .map((r) => ({
        productId: r.productId,
        wholeQuantity: r.wholeQuantity !== "" ? Number(r.wholeQuantity) : undefined,
        looseQuantity: r.looseQuantity !== "" ? Number(r.looseQuantity) : undefined,
        note: r.note || undefined,
      }));
    const finishedItems = finishedRows
      .filter((r) => r.quantity !== "" && !Number.isNaN(Number(r.quantity)))
      .map((r) => ({ finishedGoodItemId: r.finishedGoodItemId, quantity: Number(r.quantity), note: r.note || undefined }));

    if (items.length === 0 && finishedItems.length === 0) {
      setError("Vui lòng thêm ít nhất 1 dòng nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    createCheck.mutate(
      { note: note || undefined, items, finishedItems },
      {
        onSuccess: (created) => router.push(`/stock-checks/${created.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu kiểm thất bại"),
      },
    );
  }

  async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kiểm kê");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      products[0]?.name ?? "Tên NL mẫu",
      products[0]?.unit?.name ?? "",
      5,
      900,
      finishedGoodItems[0]?.name ?? "Tên đồ thành phẩm mẫu",
      finishedGoodItems[0]?.unit?.name ?? "",
      700,
    ]);
    await downloadWorkbook(workbook, "mau-phieu-kiem-ke.xlsx");
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
        setImportResult({ updated: 0, added: 0, errors: ["Không đọc được sheet nào trong file."] });
        return;
      }

      const productByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
      const finishedByName = new Map(finishedGoodItems.map((f) => [f.name.trim().toLowerCase(), f]));
      const errors: string[] = [];
      let updated = 0;
      let added = 0;

      const nextMaterialRows = [...materialRows];
      const materialIndexById = new Map(nextMaterialRows.map((r, index) => [r.productId, index]));
      const nextFinishedRows = [...finishedRows];
      const finishedIndexById = new Map(nextFinishedRows.map((r, index) => [r.finishedGoodItemId, index]));

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const materialName = String(row.getCell(1).value ?? "").trim();
        const wholeRaw = row.getCell(3).value;
        const looseRaw = row.getCell(4).value;
        if (materialName) {
          const product = productByName.get(materialName.toLowerCase());
          if (!product) {
            errors.push(`Dòng ${rowNumber}: không tìm thấy nguyên liệu có tên "${materialName}"`);
          } else {
            const wholeQuantity = wholeRaw === null || wholeRaw === undefined || wholeRaw === "" ? "" : String(Number(wholeRaw));
            const looseQuantity = looseRaw === null || looseRaw === undefined || looseRaw === "" ? "" : String(Number(looseRaw));
            const existingIndex = materialIndexById.get(product.id);
            if (existingIndex !== undefined) {
              nextMaterialRows[existingIndex] = { ...nextMaterialRows[existingIndex], wholeQuantity, looseQuantity };
              updated++;
            } else {
              nextMaterialRows.push({ productId: product.id, product, wholeQuantity, looseQuantity, note: "" });
              materialIndexById.set(product.id, nextMaterialRows.length - 1);
              added++;
            }
          }
        }

        const finishedName = String(row.getCell(5).value ?? "").trim();
        const finishedQtyRaw = row.getCell(7).value;
        if (finishedName) {
          const finishedItem = finishedByName.get(finishedName.toLowerCase());
          if (!finishedItem) {
            errors.push(`Dòng ${rowNumber}: không tìm thấy đồ thành phẩm có tên "${finishedName}"`);
          } else if (finishedQtyRaw !== null && finishedQtyRaw !== undefined && finishedQtyRaw !== "" && Number.isNaN(Number(finishedQtyRaw))) {
            errors.push(`Dòng ${rowNumber}: số lượng đồ thành phẩm không hợp lệ`);
          } else {
            const quantity = finishedQtyRaw === null || finishedQtyRaw === undefined || finishedQtyRaw === "" ? "" : String(Number(finishedQtyRaw));
            const existingIndex = finishedIndexById.get(finishedItem.id);
            if (existingIndex !== undefined) {
              nextFinishedRows[existingIndex] = { ...nextFinishedRows[existingIndex], quantity };
              updated++;
            } else {
              nextFinishedRows.push({ finishedGoodItemId: finishedItem.id, item: finishedItem, quantity, note: "" });
              finishedIndexById.set(finishedItem.id, nextFinishedRows.length - 1);
              added++;
            }
          }
        }
      });

      setMaterialRows(nextMaterialRows);
      setFinishedRows(nextFinishedRows);
      setImportResult({ updated, added, errors });
    } catch {
      setImportResult({ updated: 0, added: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  async function exportData() {
    setExcelMenuOpen(false);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kiểm kê");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header: header.replace("*", ""), width: 22 }));
    sheet.getRow(1).font = { bold: true };
    const rowCount = Math.max(materialRows.length, finishedRows.length);
    for (let i = 0; i < rowCount; i++) {
      const m = materialRows[i];
      const f = finishedRows[i];
      sheet.addRow([
        m?.product.name ?? "",
        m?.product.unit?.name ?? "",
        m?.wholeQuantity ?? "",
        m?.looseQuantity ?? "",
        f?.item.name ?? "",
        f?.item.unit?.name ?? "",
        f?.quantity ?? "",
      ]);
    }
    await downloadWorkbook(workbook, "phieu-kiem-ke.xlsx");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/stock-checks" className="self-start text-sm text-indigo-600 hover:underline">
          ← Danh sách phiếu kiểm kê
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Tạo phiếu kiểm kê</h1>
        <p className="text-sm text-slate-500">
          Kiểm tồn kho hiện có, không cần chọn kho hàng. Thời gian kiểm được lấy tự động theo lúc lưu phiếu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
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
        <CardBody className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-600">Ghi chú</label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nguyên liệu</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="relative w-72">
            <Input
              placeholder="Nhập mã/tên và ấn Enter"
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              onKeyDown={handleMaterialSearchKeyDown}
            />
            {materialSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {materialSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      addMaterialRow(p);
                      setMaterialSearch("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {materialRows.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có nguyên liệu nào được chọn</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-3">Tên NL</th>
                  <th className="py-2 pr-3">Đơn vị</th>
                  <th className="py-2 pr-3">SL chẵn</th>
                  <th className="py-2 pr-3">SL lẻ (gam)</th>
                  <th className="py-2 pr-3">Ghi chú</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {materialRows.map((row) => (
                  <tr key={row.productId} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{row.product.name}</td>
                    <td className="py-2 pr-3">{row.product.unit?.name}</td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-24"
                        value={row.wholeQuantity}
                        onChange={(e) => updateMaterialRow(row.productId, { wholeQuantity: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-24"
                        value={row.looseQuantity}
                        onChange={(e) => updateMaterialRow(row.productId, { looseQuantity: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8 w-40"
                        value={row.note}
                        onChange={(e) => updateMaterialRow(row.productId, { note: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => removeMaterialRow(row.productId)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đồ thành phẩm</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="relative w-72">
            <Input
              placeholder="Nhập mã/tên và ấn Enter"
              value={finishedSearch}
              onChange={(e) => setFinishedSearch(e.target.value)}
              onKeyDown={handleFinishedSearchKeyDown}
            />
            {finishedSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {finishedSuggestions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      addFinishedRow(f);
                      setFinishedSearch("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{f.name}</span>
                    <span className="text-xs text-slate-400">{f.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {finishedRows.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có đồ thành phẩm nào được chọn</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="py-2 pr-3">Tên đồ thành phẩm</th>
                  <th className="py-2 pr-3">Đơn vị kiểm</th>
                  <th className="py-2 pr-3">Số lượng</th>
                  <th className="py-2 pr-3">Ghi chú</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {finishedRows.map((row) => (
                  <tr key={row.finishedGoodItemId} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{row.item.name}</td>
                    <td className="py-2 pr-3">{row.item.unit?.name}</td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-28"
                        value={row.quantity}
                        onChange={(e) => updateFinishedRow(row.finishedGoodItemId, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        className="h-8 w-40"
                        value={row.note}
                        onChange={(e) => updateFinishedRow(row.finishedGoodItemId, { note: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => removeFinishedRow(row.finishedGoodItemId)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={createCheck.isPending}>
          {createCheck.isPending ? "Đang lưu..." : "Lưu phiếu kiểm"}
        </Button>
      </div>

      {importOpen && (
        <Modal title="Nhập số liệu kiểm kê từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Tên NL, Đơn vị (chỉ để tham khảo), SL chẵn, SL lẻ (gam), Tên
              đồ thành phẩm, Đơn vị kiểm (chỉ để tham khảo), Số lượng. Mỗi dòng có thể chỉ điền phần nguyên liệu, chỉ phần đồ
              thành phẩm, hoặc cả hai — 2 danh sách độc lập với nhau. Dữ liệu đã có trong bảng sẽ được cập nhật; chưa có sẽ tự
              động thêm vào.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">
                  Đã cập nhật {importResult.updated}, thêm mới {importResult.added} dòng.
                </p>
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
