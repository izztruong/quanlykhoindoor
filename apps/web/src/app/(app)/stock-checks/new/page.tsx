"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateStockCheck } from "@/hooks/useStockChecks";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import type { FinishedGoodItem, Product, ProductType } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface MaterialEntry {
  wholeQuantity: string;
  looseQuantity: string;
  note: string;
}

interface FinishedEntry {
  quantity: string;
  note: string;
}

const PRODUCT_TYPE_GROUPS: { key: ProductType; label: string }[] = [
  { key: "NVL", label: "Nguyên vật liệu" },
  { key: "COC_TAKE", label: "Cốc & ống hút" },
  { key: "BANH", label: "Bánh" },
  { key: "DUNG_CU", label: "Dụng cụ" },
  { key: "KHAC", label: "Khác" },
];

const TEMPLATE_HEADER = ["Tên NL*", "Đơn vị", "SL chẵn", "SL lẻ (theo đơn vị công thức)", "Tên đồ thành phẩm*", "Đơn vị kiểm", "Số lượng"];

function nowForDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function matchesQuery(name: string, code: string, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}

// Defined at module scope (not inside NewStockCheckPage) so their identity stays stable across
// re-renders — nesting these would make React remount the whole table (losing scroll position)
// on every keystroke, since a new function component is created for each parent render.
interface MaterialGroupTableProps {
  groupKey: string;
  label: string;
  items: Product[];
  filter: string;
  onFilterChange: (value: string) => void;
  entryFor: (productId: string) => MaterialEntry;
  onUpdateEntry: (productId: string, patch: Partial<MaterialEntry>) => void;
}

function MaterialGroupTable({ groupKey, label, items, filter, onFilterChange, entryFor, onUpdateEntry }: MaterialGroupTableProps) {
  const filtered = items.filter((p) => matchesQuery(p.name, p.code, filter));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Input placeholder="Lọc theo tên/mã..." value={filter} onChange={(e) => onFilterChange(e.target.value)} className="w-64" />
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">Không có hàng hoá nào trong nhóm này.</p>
        ) : (
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Tên NL</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Đơn vị</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">SL chẵn</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">SL lẻ</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const entry = entryFor(product.id);
                  return (
                    <tr key={product.id}>
                      <td className="border border-slate-200 px-3 py-2">{product.name}</td>
                      <td className="border border-slate-200 px-3 py-2">{product.unit?.name}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className="h-8 w-24"
                          value={entry.wholeQuantity}
                          onChange={(e) => onUpdateEntry(product.id, { wholeQuantity: e.target.value })}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="h-8 w-24"
                              value={entry.looseQuantity}
                              onChange={(e) => onUpdateEntry(product.id, { looseQuantity: e.target.value })}
                            />
                            {product.recipeUnit?.name && <span className="text-xs text-slate-400">{product.recipeUnit.name}</span>}
                          </div>
                          {product.tareWeight != null && Number(product.tareWeight) > 0 && (
                            <span className="text-xs text-amber-600">
                              Cân cả vỏ — tự trừ {formatNumber(product.tareWeight)}
                              {product.recipeUnit?.name}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input className="h-8 w-40" value={entry.note} onChange={(e) => onUpdateEntry(product.id, { note: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border border-slate-200 px-3 py-4 text-center text-slate-400">
                      Không tìm thấy hàng hoá khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

interface FinishedGroupTableProps {
  items: FinishedGoodItem[];
  filter: string;
  onFilterChange: (value: string) => void;
  entryFor: (itemId: string) => FinishedEntry;
  onUpdateEntry: (itemId: string, patch: Partial<FinishedEntry>) => void;
}

function FinishedGroupTable({ items, filter, onFilterChange, entryFor, onUpdateEntry }: FinishedGroupTableProps) {
  const filtered = items.filter((f) => matchesQuery(f.name, f.code, filter));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Đồ thành phẩm</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Input placeholder="Lọc theo tên/mã..." value={filter} onChange={(e) => onFilterChange(e.target.value)} className="w-64" />
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">
            Chưa có đồ thành phẩm nào được gán nhóm &quot;Đồ thành phẩm&quot;. Vào Danh mục → Đồ thành phẩm để gán nhóm.
          </p>
        ) : (
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Tên đồ thành phẩm</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Đơn vị kiểm</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Số lượng</th>
                  <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const entry = entryFor(item.id);
                  return (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-3 py-2">{item.name}</td>
                      <td className="border border-slate-200 px-3 py-2">{item.unit?.name}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className="h-8 w-28"
                          value={entry.quantity}
                          onChange={(e) => onUpdateEntry(item.id, { quantity: e.target.value })}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input className="h-8 w-40" value={entry.note} onChange={(e) => onUpdateEntry(item.id, { note: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="border border-slate-200 px-3 py-4 text-center text-slate-400">
                      Không tìm thấy đồ thành phẩm khớp bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function NewStockCheckPage() {
  const router = useRouter();
  const { data: products = [] } = useProducts();
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createCheck = useCreateStockCheck();

  const [checkedAt, setCheckedAt] = useState(nowForDatetimeLocal);
  const [note, setNote] = useState("");
  const [materialEntries, setMaterialEntries] = useState<Record<string, MaterialEntry>>({});
  const [finishedEntries, setFinishedEntries] = useState<Record<string, FinishedEntry>>({});
  const [groupFilters, setGroupFilters] = useState<Record<string, string>>({});
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

  const productsByType = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const list = map.get(p.type) ?? [];
      list.push(p);
      map.set(p.type, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [products]);

  const thanhPhamItems = useMemo(
    () => finishedGoodItems.filter((f) => f.category === "THANH_PHAM").sort((a, b) => a.name.localeCompare(b.name)),
    [finishedGoodItems],
  );

  function materialEntryFor(productId: string): MaterialEntry {
    return materialEntries[productId] ?? { wholeQuantity: "", looseQuantity: "", note: "" };
  }

  function updateMaterialEntry(productId: string, patch: Partial<MaterialEntry>) {
    setMaterialEntries((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? { wholeQuantity: "", looseQuantity: "", note: "" }), ...patch },
    }));
  }

  function finishedEntryFor(itemId: string): FinishedEntry {
    return finishedEntries[itemId] ?? { quantity: "", note: "" };
  }

  function updateFinishedEntry(itemId: string, patch: Partial<FinishedEntry>) {
    setFinishedEntries((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { quantity: "", note: "" }), ...patch } }));
  }

  function groupFilterFor(key: string): string {
    return groupFilters[key] ?? "";
  }

  function setGroupFilter(key: string, value: string) {
    setGroupFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    setError(null);
    const items = Object.entries(materialEntries)
      .filter(([, entry]) => entry.wholeQuantity !== "" || entry.looseQuantity !== "")
      .map(([productId, entry]) => ({
        productId,
        wholeQuantity: entry.wholeQuantity !== "" ? Number(entry.wholeQuantity) : undefined,
        looseQuantity: entry.looseQuantity !== "" ? Number(entry.looseQuantity) : undefined,
        note: entry.note || undefined,
      }));
    const finishedItems = Object.entries(finishedEntries)
      .filter(([, entry]) => entry.quantity !== "" && !Number.isNaN(Number(entry.quantity)))
      .map(([finishedGoodItemId, entry]) => ({ finishedGoodItemId, quantity: Number(entry.quantity), note: entry.note || undefined }));

    if (items.length === 0 && finishedItems.length === 0) {
      setError("Vui lòng nhập số lượng cho ít nhất 1 nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    createCheck.mutate(
      { checkedAt: checkedAt ? new Date(checkedAt).toISOString() : undefined, note: note || undefined, items, finishedItems },
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
      thanhPhamItems[0]?.name ?? "Tên đồ thành phẩm mẫu",
      thanhPhamItems[0]?.unit?.name ?? "",
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
      const finishedByName = new Map(thanhPhamItems.map((f) => [f.name.trim().toLowerCase(), f]));
      const errors: string[] = [];
      let updated = 0;
      let added = 0;

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
            const existed = Boolean(materialEntries[product.id]);
            updateMaterialEntry(product.id, { wholeQuantity, looseQuantity });
            if (existed) updated++;
            else added++;
          }
        }

        const finishedName = String(row.getCell(5).value ?? "").trim();
        const finishedQtyRaw = row.getCell(7).value;
        if (finishedName) {
          const finishedItem = finishedByName.get(finishedName.toLowerCase());
          if (!finishedItem) {
            errors.push(`Dòng ${rowNumber}: không tìm thấy đồ thành phẩm có tên "${finishedName}" trong nhóm Đồ thành phẩm`);
          } else if (finishedQtyRaw !== null && finishedQtyRaw !== undefined && finishedQtyRaw !== "" && Number.isNaN(Number(finishedQtyRaw))) {
            errors.push(`Dòng ${rowNumber}: số lượng đồ thành phẩm không hợp lệ`);
          } else {
            const quantity = finishedQtyRaw === null || finishedQtyRaw === undefined || finishedQtyRaw === "" ? "" : String(Number(finishedQtyRaw));
            const existed = Boolean(finishedEntries[finishedItem.id]);
            updateFinishedEntry(finishedItem.id, { quantity });
            if (existed) updated++;
            else added++;
          }
        }
      });

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
    const allProducts = PRODUCT_TYPE_GROUPS.flatMap((g) => productsByType.get(g.key) ?? []);
    const rowCount = Math.max(allProducts.length, thanhPhamItems.length);
    for (let i = 0; i < rowCount; i++) {
      const p = allProducts[i];
      const f = thanhPhamItems[i];
      const m = p ? materialEntryFor(p.id) : undefined;
      const fe = f ? finishedEntryFor(f.id) : undefined;
      sheet.addRow([p?.name ?? "", p?.unit?.name ?? "", m?.wholeQuantity ?? "", m?.looseQuantity ?? "", f?.name ?? "", f?.unit?.name ?? "", fe?.quantity ?? ""]);
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
          Kiểm tồn kho hiện có, không cần chọn kho hàng. Danh sách đã liệt kê sẵn theo từng nhóm — chỉ cần nhập số lượng cho
          hàng hoá đang kiểm.
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
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Thời gian kiểm</label>
            <Input type="datetime-local" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Ghi chú</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
          </div>
        </CardBody>
      </Card>

      {PRODUCT_TYPE_GROUPS.map((group) => (
        <MaterialGroupTable
          key={group.key}
          groupKey={group.key}
          label={group.label}
          items={productsByType.get(group.key) ?? []}
          filter={groupFilterFor(group.key)}
          onFilterChange={(value) => setGroupFilter(group.key, value)}
          entryFor={materialEntryFor}
          onUpdateEntry={updateMaterialEntry}
        />
      ))}

      <FinishedGroupTable
        items={thanhPhamItems}
        filter={groupFilterFor("THANH_PHAM")}
        onFilterChange={(value) => setGroupFilter("THANH_PHAM", value)}
        entryFor={finishedEntryFor}
        onUpdateEntry={updateFinishedEntry}
      />

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
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Tên NL, Đơn vị (chỉ để tham khảo), SL chẵn, SL lẻ (theo đơn
              vị công thức của từng NL), Tên đồ thành phẩm (phải thuộc nhóm &quot;Đồ thành phẩm&quot;), Đơn vị kiểm (chỉ để
              tham khảo), Số lượng. Mỗi dòng có thể chỉ điền phần nguyên liệu, chỉ phần đồ thành phẩm, hoặc cả hai — 2 danh
              sách độc lập với nhau. Số lượng nhập vào sẽ điền thẳng vào đúng dòng của hàng hoá đó trong danh sách bên dưới.
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
