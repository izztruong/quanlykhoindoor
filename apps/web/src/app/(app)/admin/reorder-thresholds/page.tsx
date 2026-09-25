"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProducts } from "@/hooks/useCatalog";
import { useReorderThresholds, useSaveReorderThresholds } from "@/hooks/useReorderThresholds";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { type ExcelColumn, exportRowsToExcel, sanitizeExcelRow } from "@/lib/excelExport";
import { REORDER_MODE_LABELS, type Product, type ReorderMode } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const MODES: ReorderMode[] = ["THRESHOLD", "FIXED", "COVERAGE", "OFF"];

/**
 * Chỉ số cột Excel gom vào MỘT hằng số dùng chung cho mẫu trắng, xuất và nhập — đổi bố cục ở một chỗ
 * là cả ba đường đi theo. Thiếu điều này thì thêm một cột là phần nhập đọc lệch cột, số liệu hỏng mà
 * file trông vẫn bình thường.
 */
const EXCEL_COLUMNS = ["Mã hàng hoá*", "Cách gọi", "Tối thiểu", "Tối đa", "SL gọi cố định", "Số ngày cần phủ"] as const;
const COL = { code: 1, mode: 2, min: 3, max: 4, fixed: 5, cover: 6 } as const;

/** Nhãn tiếng Việt ↔ mã chế độ, để file Excel đọc được bằng tiếng người. */
const MODE_BY_LABEL = new Map(MODES.map((m) => [REORDER_MODE_LABELS[m].toLowerCase(), m]));

type RowField = "mode" | "min" | "max" | "fixed" | "cover";
type RowInput = Partial<Record<RowField, string>>;

export default function ReorderThresholdsPage() {
  const { data: users = [] } = useUserOptions();
  const { data: products = [] } = useProducts();
  const [userId, setUserId] = useState("");
  const { data: thresholds = [] } = useReorderThresholds(userId || undefined);
  const saveThresholds = useSaveReorderThresholds();
  const [search, setSearch] = useState("");
  const filteredProducts = useMemo(
    () => (search.trim() ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase())) : products),
    [products, search],
  );
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

  const savedByProductId = useMemo(() => new Map(thresholds.map((t) => [t.productId, t])), [thresholds]);

  function valueFor(productId: string, field: RowField): string {
    const override = overrides[productId]?.[field];
    if (override !== undefined) return override;
    const saved = savedByProductId.get(productId);
    if (!saved) return field === "mode" ? "THRESHOLD" : "";
    const value =
      field === "mode"
        ? saved.mode
        : field === "min"
          ? saved.minQuantity
          : field === "max"
            ? saved.maxQuantity
            : field === "fixed"
              ? saved.fixedQuantity
              : saved.coverDays;
    // null = chế độ hiện tại không dùng cột này → ô trống, không phải chuỗi "null".
    return value == null ? "" : String(value);
  }

  function modeFor(productId: string): ReorderMode {
    const value = valueFor(productId, "mode");
    return (MODES as string[]).includes(value) ? (value as ReorderMode) : "THRESHOLD";
  }

  function selectUser(id: string) {
    setUserId(id);
    setOverrides({});
    setSaved(false);
  }

  function setRow(productId: string, field: RowField, value: string) {
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
    const num = (raw: string) => (raw.trim() ? Number(raw.trim()) : null);
    const items = Object.keys(overrides)
      .filter((productId) => validProductIds.has(productId))
      // Dựng ĐỦ mọi trường từ override-hoặc-giá-trị-đã-lưu, không chỉ trường vừa sửa. Nếu chỉ gửi
      // trường vừa sửa thì sửa ô tối thiểu của một hàng đang ở chế độ Gọi cố định sẽ gửi kèm chế độ
      // mặc định, làm hàng đó lặng lẽ đổi chế độ rồi bị xoá vì thiếu min/max.
      .map((productId) => ({
        productId,
        mode: modeFor(productId),
        minQuantity: num(valueFor(productId, "min")),
        maxQuantity: num(valueFor(productId, "max")),
        fixedQuantity: num(valueFor(productId, "fixed")),
        coverDays: num(valueFor(productId, "cover")),
      }));

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
    sheet.columns = EXCEL_COLUMNS.map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(sanitizeExcelRow([products[0]?.code ?? "SP001", REORDER_MODE_LABELS.THRESHOLD, 0, 0, "", ""]));
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

      // Kiểm HÀNG TIÊU ĐỀ trước khi đọc dòng nào: file mẫu cũ 3 cột vẫn mở được bằng Excel, và nếu
      // đọc thẳng thì cột "Tối thiểu" cũ rơi vào ô "Cách gọi" mới — số liệu hỏng mà không báo lỗi.
      const headerRow = sheet.getRow(1);
      const headerMismatch = EXCEL_COLUMNS.findIndex(
        (expected, index) => String(headerRow.getCell(index + 1).value ?? "").trim() !== expected,
      );
      if (headerMismatch !== -1) {
        setImportResult({
          updated: 0,
          errors: [
            `Hàng tiêu đề không khớp file mẫu ở cột ${headerMismatch + 1} (cần "${EXCEL_COLUMNS[headerMismatch]}"). Vui lòng tải lại file mẫu mới.`,
          ],
        });
        return;
      }

      const productByCode = new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
      const errors: string[] = [];
      let updated = 0;
      const nextOverrides = { ...overrides };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(COL.code).value ?? "").trim();
        if (!code) return;

        const product = productByCode.get(code.toLowerCase());
        if (!product) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy hàng hoá có mã "${code}"`);
          return;
        }

        const cell = (index: number) => {
          const raw = row.getCell(index).value;
          return raw === null || raw === undefined || raw === "" ? "" : String(Number(raw));
        };
        const min = cell(COL.min);
        const max = cell(COL.max);
        const fixed = cell(COL.fixed);
        const cover = cell(COL.cover);

        const modeLabel = String(row.getCell(COL.mode).value ?? "").trim().toLowerCase();
        const mode = modeLabel ? MODE_BY_LABEL.get(modeLabel) : "THRESHOLD";
        if (!mode) {
          errors.push(
            `Dòng ${rowNumber}: cách gọi "${modeLabel}" không hợp lệ (dùng một trong: ${MODES.map((m) => REORDER_MODE_LABELS[m]).join(", ")})`,
          );
          return;
        }

        if ([min, max, fixed, cover].some((v) => v && Number.isNaN(Number(v)))) {
          errors.push(`Dòng ${rowNumber}: định lượng không hợp lệ`);
          return;
        }
        if (mode === "THRESHOLD" && min && max && Number(max) < Number(min)) {
          errors.push(`Dòng ${rowNumber}: định lượng tối đa phải >= tối thiểu`);
          return;
        }
        if (mode === "FIXED" && !(Number(fixed) > 0)) {
          errors.push(`Dòng ${rowNumber}: cách gọi cố định cần SL gọi cố định lớn hơn 0`);
          return;
        }
        if (mode === "COVERAGE" && !cover) {
          errors.push(`Dòng ${rowNumber}: cách gọi theo số ngày cần khai Số ngày cần phủ`);
          return;
        }

        nextOverrides[product.id] = { mode, min, max, fixed, cover };
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
    // Sáu cột đầu PHẢI trùng EXCEL_COLUMNS để vòng "xuất ra → sửa → nhập lại" chạy được: phần nhập
    // kiểm hàng tiêu đề trên đúng sáu cột đó. Cột đọc cho người xếp xuống cuối.
    const columns: ExcelColumn<Product>[] = [
      { header: EXCEL_COLUMNS[0], value: (p) => p.code },
      { header: EXCEL_COLUMNS[1], value: (p) => REORDER_MODE_LABELS[modeFor(p.id)] },
      { header: EXCEL_COLUMNS[2], value: (p) => valueFor(p.id, "min") },
      { header: EXCEL_COLUMNS[3], value: (p) => valueFor(p.id, "max") },
      { header: EXCEL_COLUMNS[4], value: (p) => valueFor(p.id, "fixed") },
      { header: EXCEL_COLUMNS[5], value: (p) => valueFor(p.id, "cover") },
      { header: "Tên hàng hoá", value: (p) => p.name },
      { header: "ĐVT", value: (p) => p.unit?.name ?? "-" },
    ];
    await exportRowsToExcel("Định lượng", columns, products, "dinh-luong-order-nhanh.xlsx");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Định lượng Order nhanh</h1>
        <p className="text-sm text-slate-500">
          Thiết lập cách gọi cho từng hàng hoá theo từng tài khoản. <strong>Theo tối thiểu / tối đa</strong> giữ nguyên cách
          Order nhanh vẫn chạy · <strong>Gọi cố định</strong> luôn đặt đúng một lượng, không cần nhập tồn ·{" "}
          <strong>Đủ dùng N ngày</strong> tính theo mức tiêu thụ thật của quán · <strong>Không đề xuất</strong> để bỏ qua.
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
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Mã</th>
                  <th className="border border-slate-200 px-3 py-2">Tên hàng hoá</th>
                  <th className="border border-slate-200 px-3 py-2">ĐVT</th>
                  <th className="border border-slate-200 px-3 py-2">Cách gọi</th>
                  <th className="border border-slate-200 px-3 py-2">Tối thiểu</th>
                  <th className="border border-slate-200 px-3 py-2">Tối đa</th>
                  <th className="border border-slate-200 px-3 py-2">SL gọi cố định</th>
                  <th className="border border-slate-200 px-3 py-2">Số ngày cần phủ</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const mode = modeFor(p.id);
                  return (
                    <tr key={p.id}>
                      <td className="border border-slate-200 px-3 py-2">{p.code}</td>
                      <td className="border border-slate-200 px-3 py-2">{p.name}</td>
                      <td className="border border-slate-200 px-3 py-2">{p.unit?.name}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Select className="w-44" value={mode} onChange={(e) => setRow(p.id, "mode", e.target.value)}>
                          {MODES.map((m) => (
                            <option key={m} value={m}>
                              {REORDER_MODE_LABELS[m]}
                            </option>
                          ))}
                        </Select>
                      </td>
                      {/* Ô của chế độ không được chọn bị khoá thay vì ẩn: giữ nguyên bố cục bảng, và giá
                          trị cũ vẫn thấy được nên bật lại chế độ là dùng lại được ngay. */}
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="w-24"
                          disabled={mode !== "THRESHOLD"}
                          value={valueFor(p.id, "min")}
                          onChange={(e) => setRow(p.id, "min", e.target.value)}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          className="w-24"
                          disabled={mode !== "THRESHOLD"}
                          value={valueFor(p.id, "max")}
                          onChange={(e) => setRow(p.id, "max", e.target.value)}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24"
                          disabled={mode !== "FIXED"}
                          value={valueFor(p.id, "fixed")}
                          onChange={(e) => setRow(p.id, "fixed", e.target.value)}
                        />
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          max="365"
                          className="w-24"
                          disabled={mode !== "COVERAGE"}
                          value={valueFor(p.id, "cover")}
                          onChange={(e) => setRow(p.id, "cover", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
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
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: {EXCEL_COLUMNS.join(", ")} (cột có dấu * là bắt buộc phải
              điền). Với cách gọi <em>Theo tối thiểu / tối đa</em>, để trống cả hai ô nghĩa là gỡ hàng hoá khỏi danh sách.
              Dữ liệu chỉ áp dụng cho tài khoản đang chọn, cần bấm &quot;Lưu định lượng&quot; để lưu lại.
              <br />
              <strong>File mẫu cũ 3 cột không nhập được nữa</strong> — tải lại file mẫu mới.
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
