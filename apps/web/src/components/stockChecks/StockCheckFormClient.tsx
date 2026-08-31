"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateStockCheck, useUpdateStockCheck } from "@/hooks/useStockChecks";
import { ApiError } from "@/lib/api-client";
import { nowForDatetimeLocal, toDatetimeLocal } from "@/lib/dateRange";
import { sanitizeExcelRow } from "@/lib/excelExport";
import type { FinishedGoodItem, Product, ProductType, StockCheck, StockCheckType } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface MaterialEntry {
  wholeQuantity: string;
  looseQuantity: string;
  wholePrice: string;
  loosePrice: string;
  note: string;
}

interface FinishedEntry {
  quantity: string;
  price: string;
  note: string;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Giá mặc định gợi ý sẵn khi mở form: giá chẵn lấy thẳng Product.costPrice, giá lẻ quy về đơn vị
 * công thức bằng đúng công thức Check Cost đang dùng (costPrice ÷ recipeUnitsPerBaseUnit).
 * Vẫn cho sửa tay vì lô hàng thực tế có thể mua giá khác.
 */
function defaultMaterialEntry(product: Product): MaterialEntry {
  const costPrice = Number(product.costPrice) || 0;
  const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
  return {
    wholeQuantity: "",
    looseQuantity: "",
    wholePrice: costPrice ? String(costPrice) : "",
    loosePrice: costPrice && factor ? String(roundPrice(costPrice / factor)) : "",
    note: "",
  };
}

function defaultFinishedEntry(item: FinishedGoodItem): FinishedEntry {
  const sellingPrice = item.sellingPrice != null ? Number(item.sellingPrice) : 0;
  return { quantity: "", price: sellingPrice ? String(sellingPrice) : "", note: "" };
}

const PRODUCT_TYPE_GROUPS: { key: ProductType; label: string }[] = [
  { key: "NVL", label: "Nguyên vật liệu" },
  { key: "COC_TAKE", label: "Cốc & ống hút" },
  { key: "BANH", label: "Bánh" },
  { key: "DUNG_CU", label: "Dụng cụ" },
  { key: "KHAC", label: "Khác" },
];

// Đúng bằng những gì form hiển thị — không có cột giá, vì form nhập liệu cũng đã bỏ giá cho đỡ
// rối mắt. Giá vẫn được lưu vào phiếu, nhưng lấy tự động từ danh mục (Product.costPrice /
// FinishedGoodItem.sellingPrice) chứ không nhập tay qua Excel nữa.
const TEMPLATE_HEADER = [
  "Tên NL*",
  "Đơn vị",
  "SL chẵn",
  "SL lẻ (theo đơn vị công thức)",
  "Tên đồ thành phẩm*",
  "Đơn vị kiểm",
  "Số lượng",
];

/** Chỉ số cột (1-based) của file Excel, gom một chỗ để mẫu/xuất/nhập không bao giờ lệch nhau. */
const COL = { materialName: 1, wholeQty: 3, looseQty: 4, finishedName: 5, finishedQty: 7 } as const;

function matchesQuery(name: string, code: string, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}

// Defined at module scope (not inside the form component) so their identity stays stable across
// re-renders — nesting these would make React remount the whole table (losing scroll position)
// on every keystroke, since a new function component is created for each parent render.
interface MaterialGroupTableProps {
  groupKey: string;
  label: string;
  items: Product[];
  filter: string;
  onFilterChange: (value: string) => void;
  entryFor: (product: Product) => MaterialEntry;
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
                  const entry = entryFor(product);
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
  entryFor: (item: FinishedGoodItem) => FinishedEntry;
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
                  const entry = entryFor(item);
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

function toMaterialEntries(check?: StockCheck): Record<string, MaterialEntry> {
  const entries: Record<string, MaterialEntry> = {};
  for (const it of check?.items ?? []) {
    // Phiếu cũ (tạo trước khi có cột giá) chưa có giá — rơi về giá gợi ý từ hàng hoá để admin
    // không phải gõ lại từ đầu khi mở ra sửa.
    const fallback = defaultMaterialEntry(it.product);
    entries[it.productId] = {
      wholeQuantity: it.wholeQuantity != null ? String(Number(it.wholeQuantity)) : "",
      looseQuantity: it.looseQuantity != null ? String(Number(it.looseQuantity)) : "",
      wholePrice: it.wholePrice != null ? String(Number(it.wholePrice)) : fallback.wholePrice,
      loosePrice: it.loosePrice != null ? String(Number(it.loosePrice)) : fallback.loosePrice,
      note: it.note ?? "",
    };
  }
  return entries;
}

function toFinishedEntries(check?: StockCheck): Record<string, FinishedEntry> {
  const entries: Record<string, FinishedEntry> = {};
  for (const it of check?.finishedItems ?? []) {
    const fallback = defaultFinishedEntry(it.finishedGoodItem);
    entries[it.finishedGoodItemId] = {
      quantity: it.quantity != null ? String(Number(it.quantity)) : "",
      price: it.price != null ? String(Number(it.price)) : fallback.price,
      note: it.note ?? "",
    };
  }
  return entries;
}

interface StockCheckFormClientProps {
  /** Phiếu hiện có — truyền vào để vào chế độ sửa; để trống là tạo mới. */
  existing?: StockCheck;
}

export function StockCheckFormClient({ existing }: StockCheckFormClientProps) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createCheck = useCreateStockCheck();
  const updateCheck = useUpdateStockCheck(existing?.id ?? "");

  // Phiếu cũ chưa có loại thì mặc định về phiếu tuần — admin sửa lại được ngay tại đây, và việc
  // lưu sẽ tính lại hạn theo loại mới.
  const [type, setType] = useState<StockCheckType>(existing?.type ?? "WEEKLY");
  const [checkedAt, setCheckedAt] = useState(() => (existing ? toDatetimeLocal(existing.checkedAt) : nowForDatetimeLocal()));
  const [note, setNote] = useState(existing?.note ?? "");
  const [materialEntries, setMaterialEntries] = useState<Record<string, MaterialEntry>>(() => toMaterialEntries(existing));
  const [finishedEntries, setFinishedEntries] = useState<Record<string, FinishedEntry>>(() => toFinishedEntries(existing));
  const [groupFilters, setGroupFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

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
    // Nhóm hàng hoá trước, rồi mới tới tên — để hàng cùng nhóm nằm liền nhau, giống thứ tự bên
    // trang Order nhanh. Vẫn giữ nguyên việc tách 5 bảng theo LOẠI hàng hoá: loại và nhóm là hai
    // trục phân loại độc lập, gộp lại sẽ trộn lẫn bánh/dụng cụ vào giữa nguyên liệu.
    //
    // Cũng là thứ tự dùng cho mẫu Excel (allProducts đọc lại chính map này), nên bảng trên màn
    // hình và file xuất ra luôn khớp dòng nhau khi đối chiếu.
    for (const list of map.values()) {
      list.sort((a, b) => (a.productGroup?.name ?? "").localeCompare(b.productGroup?.name ?? "") || a.name.localeCompare(b.name));
    }
    return map;
  }, [products]);

  const thanhPhamItems = useMemo(
    () => finishedGoodItems.filter((f) => f.category === "THANH_PHAM").sort((a, b) => a.name.localeCompare(b.name)),
    [finishedGoodItems],
  );

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const finishedById = useMemo(() => new Map(finishedGoodItems.map((f) => [f.id, f])), [finishedGoodItems]);

  function materialEntryFor(product: Product): MaterialEntry {
    return materialEntries[product.id] ?? defaultMaterialEntry(product);
  }

  function updateMaterialEntry(productId: string, patch: Partial<MaterialEntry>) {
    setMaterialEntries((prev) => {
      const product = productById.get(productId);
      const base = prev[productId] ?? (product ? defaultMaterialEntry(product) : { wholeQuantity: "", looseQuantity: "", wholePrice: "", loosePrice: "", note: "" });
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  }

  function finishedEntryFor(item: FinishedGoodItem): FinishedEntry {
    return finishedEntries[item.id] ?? defaultFinishedEntry(item);
  }

  function updateFinishedEntry(itemId: string, patch: Partial<FinishedEntry>) {
    setFinishedEntries((prev) => {
      const item = finishedById.get(itemId);
      const base = prev[itemId] ?? (item ? defaultFinishedEntry(item) : { quantity: "", price: "", note: "" });
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  }

  function groupFilterFor(key: string): string {
    return groupFilters[key] ?? "";
  }

  function setGroupFilter(key: string, value: string) {
    setGroupFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    setError(null);
    setWarning(null);
    const items = Object.entries(materialEntries)
      .filter(([, entry]) => entry.wholeQuantity !== "" || entry.looseQuantity !== "")
      .map(([productId, entry]) => ({
        productId,
        wholeQuantity: entry.wholeQuantity !== "" ? Number(entry.wholeQuantity) : undefined,
        looseQuantity: entry.looseQuantity !== "" ? Number(entry.looseQuantity) : undefined,
        wholePrice: entry.wholePrice !== "" ? Number(entry.wholePrice) : undefined,
        loosePrice: entry.loosePrice !== "" ? Number(entry.loosePrice) : undefined,
        note: entry.note || undefined,
      }));
    const finishedItems = Object.entries(finishedEntries)
      .filter(([, entry]) => entry.quantity !== "" && !Number.isNaN(Number(entry.quantity)))
      .map(([finishedGoodItemId, entry]) => ({
        finishedGoodItemId,
        quantity: Number(entry.quantity),
        price: entry.price !== "" ? Number(entry.price) : undefined,
        note: entry.note || undefined,
      }));

    if (items.length === 0 && finishedItems.length === 0) {
      setError("Vui lòng nhập số lượng cho ít nhất 1 nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    const payload = { type, checkedAt: checkedAt ? new Date(checkedAt).toISOString() : undefined, note: note || undefined, items, finishedItems };

    if (isEdit && existing) {
      updateCheck.mutate(payload, {
        onSuccess: (updated) => {
          if (updated.affectedCostChecks.length > 0) {
            const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
            router.push(`/stock-checks/${existing.id}`);
            // Router.push is synchronous-ish for the pathname change; the toast-less warning
            // banner would unmount immediately, so surface this as a plain confirm-style alert.
            alert(
              `Đã lưu phiếu. Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
            );
            return;
          }
          router.push(`/stock-checks/${existing.id}`);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu kiểm thất bại"),
      });
      return;
    }

    createCheck.mutate(payload, {
      onSuccess: (created) => router.push(`/stock-checks/${created.id}`),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu kiểm thất bại"),
    });
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
    sheet.addRow(
      sanitizeExcelRow([
        products[0]?.name ?? "Tên NL mẫu",
        products[0]?.unit?.name ?? "",
        5,
        900,
        thanhPhamItems[0]?.name ?? "Tên đồ thành phẩm mẫu",
        thanhPhamItems[0]?.unit?.name ?? "",
        700,
      ]),
    );
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

      // Bắt buộc khớp hàng tiêu đề. File xuất theo mẫu CŨ có thêm 3 cột giá, nên đọc bằng bố cục
      // mới sẽ lấy "Giá chẵn" làm "SL lẻ" — sai số liệu kiểm kê mà không hề báo lỗi. Thà chặn
      // thẳng còn hơn nhập vào một phiếu trông vẫn bình thường nhưng số đã hỏng.
      // Mẫu trắng để "Tên NL*" còn file xuất ra bỏ dấu *, nên bỏ dấu * ở cả hai bên trước khi so.
      const normalise = (value: unknown) => String(value ?? "").replace("*", "").trim().toLowerCase();
      const expectedHeader = TEMPLATE_HEADER.map(normalise);
      const actualHeader = expectedHeader.map((_, i) => normalise(sheet.getRow(1).getCell(i + 1).value));
      if (actualHeader.join("|") !== expectedHeader.join("|")) {
        setImportResult({
          updated: 0,
          added: 0,
          errors: [
            "File không đúng mẫu hiện tại (mẫu mới đã bỏ 3 cột giá). Bấm “Tải file mẫu” để lấy mẫu mới rồi nhập lại.",
          ],
        });
        return;
      }

      const productByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
      const finishedByName = new Map(thanhPhamItems.map((f) => [f.name.trim().toLowerCase(), f]));
      const errors: string[] = [];
      let updated = 0;
      let added = 0;

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const materialName = String(row.getCell(COL.materialName).value ?? "").trim();
        const wholeRaw = row.getCell(COL.wholeQty).value;
        const looseRaw = row.getCell(COL.looseQty).value;
        if (materialName) {
          const product = productByName.get(materialName.toLowerCase());
          if (!product) {
            errors.push(`Dòng ${rowNumber}: không tìm thấy nguyên liệu có tên "${materialName}"`);
          } else {
            const wholeQuantity = wholeRaw === null || wholeRaw === undefined || wholeRaw === "" ? "" : String(Number(wholeRaw));
            const looseQuantity = looseRaw === null || looseRaw === undefined || looseRaw === "" ? "" : String(Number(looseRaw));
            const existed = Boolean(materialEntries[product.id]);
            // Chỉ ghi đè số lượng — giá giữ nguyên giá mặc định lấy từ danh mục lúc tạo dòng.
            updateMaterialEntry(product.id, { wholeQuantity, looseQuantity });
            if (existed) updated++;
            else added++;
          }
        }

        const finishedName = String(row.getCell(COL.finishedName).value ?? "").trim();
        const finishedQtyRaw = row.getCell(COL.finishedQty).value;
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
      const m = p ? materialEntryFor(p) : undefined;
      const fe = f ? finishedEntryFor(f) : undefined;
      sheet.addRow(
        sanitizeExcelRow([
          p?.name ?? "",
          p?.unit?.name ?? "",
          m?.wholeQuantity ?? "",
          m?.looseQuantity ?? "",
          f?.name ?? "",
          f?.unit?.name ?? "",
          fe?.quantity ?? "",
        ]),
      );
    }
    await downloadWorkbook(workbook, "phieu-kiem-ke.xlsx");
  }

  const isPending = isEdit ? updateCheck.isPending : createCheck.isPending;
  const backHref = isEdit && existing ? `/stock-checks/${existing.id}` : "/stock-checks";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={backHref} className="self-start text-sm text-indigo-600 hover:underline">
          ← {isEdit ? "Chi tiết phiếu kiểm kê" : "Danh sách phiếu kiểm kê"}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">{isEdit ? `Sửa phiếu ${existing?.code}` : "Tạo phiếu kiểm kê"}</h1>
        <p className="text-sm text-slate-500">
          Kiểm tồn kho hiện có, không cần chọn kho hàng. Danh sách đã liệt kê sẵn theo từng nhóm — chỉ cần nhập số lượng cho
          hàng hoá đang kiểm. Đơn giá và thành tiền tự tính theo giá vốn/giá bán đang khai trong danh mục, xem ở trang chi
          tiết phiếu sau khi lưu.
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
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Loại phiếu</label>
            <Select value={type} onChange={(e) => setType(e.target.value as StockCheckType)}>
              <option value="WEEKLY">Phiếu tuần</option>
              <option value="MONTHLY">Phiếu tháng</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Thời gian kiểm</label>
            {/* max chặn ngay trên trình duyệt cho đỡ phải gửi lên mới biết sai; server vẫn kiểm lại
                (assertCheckedAtNotInFuture) vì thuộc tính này không phải trình duyệt nào cũng ép. */}
            <Input type="datetime-local" max={nowForDatetimeLocal()} value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} />
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

      {/* Trước đây mỗi dòng hàng hoá có vỏ đều tự nhắc "Cân cả vỏ — tự trừ N gam", lặp lại rất
          nhiều lần trên một bảng dài. Gom thành một dòng duy nhất ở cuối phiếu: người kiểm chỉ
          cần biết quy tắc chung là cân cả vỏ, phần trừ bao nhiêu hệ thống tự lo (subtractTareWeight
          ở server), không phải thông tin họ cần nhớ lúc đang cân. */}
      <p className="text-sm text-amber-600">Cân cả vỏ</p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && <p className="text-sm text-amber-600">{warning}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Lưu phiếu kiểm"}
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
