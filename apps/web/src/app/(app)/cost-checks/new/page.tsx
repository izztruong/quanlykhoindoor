"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useCreateCostCheck } from "@/hooks/useCostChecks";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUsers } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import type { FinishedGoodItem } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface SoldRow {
  finishedGoodItemId: string;
  item: FinishedGoodItem;
  quantitySold: string;
}

const TEMPLATE_HEADER = ["Tên đồ thành phẩm/món*", "SL đã bán"];

export default function NewCostCheckPage() {
  const router = useRouter();
  const { data: users = [] } = useUsers();
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createCostCheck = useCreateCostCheck();

  const [userId, setUserId] = useState("");
  const { data: stockChecks = [] } = useStockChecks({ createdById: userId || undefined });
  const sortedStockChecks = useMemo(
    () => [...stockChecks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [stockChecks],
  );

  const [openingStockCheckId, setOpeningStockCheckId] = useState("");
  const [closingStockCheckId, setClosingStockCheckId] = useState("");
  const [note, setNote] = useState("");
  const [discountTra, setDiscountTra] = useState("");
  const [discountDav, setDiscountDav] = useState("");
  const [rows, setRows] = useState<SoldRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; added: number; errors: string[] } | null>(null);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.finishedGoodItemId)), [rows]);
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return finishedGoodItems
      .filter((f) => !rowIds.has(f.id) && (f.code.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, finishedGoodItems, rowIds]);

  function handleUserChange(value: string) {
    setUserId(value);
    setOpeningStockCheckId("");
    setClosingStockCheckId("");
  }

  function addRow(item: FinishedGoodItem) {
    setRows((prev) => (prev.some((r) => r.finishedGoodItemId === item.id) ? prev : [...prev, { finishedGoodItemId: item.id, item, quantitySold: "" }]));
    setSearch("");
  }

  function updateRow(finishedGoodItemId: string, quantitySold: string) {
    setRows((prev) => prev.map((r) => (r.finishedGoodItemId === finishedGoodItemId ? { ...r, quantitySold } : r)));
  }

  function removeRow(finishedGoodItemId: string) {
    setRows((prev) => prev.filter((r) => r.finishedGoodItemId !== finishedGoodItemId));
  }

  function handleSubmit() {
    setError(null);
    if (!userId) {
      setError("Vui lòng chọn quán.");
      return;
    }
    if (!openingStockCheckId || !closingStockCheckId) {
      setError("Vui lòng chọn phiếu kiểm kê đầu kỳ và cuối kỳ.");
      return;
    }
    if (openingStockCheckId === closingStockCheckId) {
      setError("Phiếu đầu kỳ và cuối kỳ phải khác nhau.");
      return;
    }
    const soldItems = rows
      .filter((r) => r.quantitySold !== "" && Number(r.quantitySold) >= 0)
      .map((r) => ({ finishedGoodItemId: r.finishedGoodItemId, quantitySold: Number(r.quantitySold) }));
    if (soldItems.length === 0) {
      setError("Vui lòng nhập ít nhất 1 dòng SL đã bán.");
      return;
    }

    createCostCheck.mutate(
      {
        userId,
        openingStockCheckId,
        closingStockCheckId,
        note: note || undefined,
        discountTra: discountTra === "" ? undefined : Number(discountTra),
        discountDav: discountDav === "" ? undefined : Number(discountDav),
        soldItems,
      },
      {
        onSuccess: (created) => router.push(`/cost-checks/${created.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu Check Cost thất bại"),
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
    const sheet = workbook.addWorksheet("SL da ban");
    sheet.columns = TEMPLATE_HEADER.map((header) => ({ header, width: 26 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([finishedGoodItems[0]?.name ?? "Tên món mẫu", 10]);
    await downloadWorkbook(workbook, "mau-sl-da-ban.xlsx");
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

      const byName = new Map(finishedGoodItems.map((f) => [f.name.trim().toLowerCase(), f]));
      const errors: string[] = [];
      let updated = 0;
      let added = 0;
      const next = [...rows];
      const indexById = new Map(next.map((r, index) => [r.finishedGoodItemId, index]));

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = String(row.getCell(1).value ?? "").trim();
        if (!name) return;
        const qtyRaw = row.getCell(2).value;
        const item = byName.get(name.toLowerCase());
        if (!item) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy "${name}"`);
          return;
        }
        if (qtyRaw !== null && qtyRaw !== undefined && qtyRaw !== "" && Number.isNaN(Number(qtyRaw))) {
          errors.push(`Dòng ${rowNumber}: SL đã bán không hợp lệ`);
          return;
        }
        const quantitySold = qtyRaw === null || qtyRaw === undefined || qtyRaw === "" ? "" : String(Number(qtyRaw));
        const existingIndex = indexById.get(item.id);
        if (existingIndex !== undefined) {
          next[existingIndex] = { ...next[existingIndex], quantitySold };
          updated++;
        } else {
          next.push({ finishedGoodItemId: item.id, item, quantitySold });
          indexById.set(item.id, next.length - 1);
          added++;
        }
      });

      setRows(next);
      setImportResult({ updated, added, errors });
    } catch {
      setImportResult({ updated: 0, added: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/cost-checks" className="self-start text-sm text-indigo-600 hover:underline">
          ← Danh sách Check Cost
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Tạo phiếu Check Cost</h1>
        <p className="text-sm text-slate-500">
          Chọn quán và 2 phiếu kiểm kê quán (đầu kỳ/cuối kỳ) đã có, rồi nhập số lượng đồ thành phẩm/món đã bán trong kỳ đó.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán</label>
            <Select value={userId} onChange={(e) => handleUserChange(e.target.value)}>
              <option value="">Chọn quán</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Phiếu kiểm kê đầu kỳ</label>
            <Select value={openingStockCheckId} onChange={(e) => setOpeningStockCheckId(e.target.value)} disabled={!userId}>
              <option value="">Chọn phiếu</option>
              {sortedStockChecks.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.code} — {formatDateTime(sc.checkedAt)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Phiếu kiểm kê cuối kỳ</label>
            <Select value={closingStockCheckId} onChange={(e) => setClosingStockCheckId(e.target.value)} disabled={!userId}>
              <option value="">Chọn phiếu</option>
              {sortedStockChecks.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.code} — {formatDateTime(sc.checkedAt)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Khuyến mãi Trà</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={discountTra}
              onChange={(e) => setDiscountTra(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Khuyến mãi ĐAV</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={discountDav}
              onChange={(e) => setDiscountDav(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className="text-sm font-medium text-slate-600">Ghi chú</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SL đồ thành phẩm/món đã bán trong kỳ</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setImportResult(null);
              setImportOpen(true);
            }}
          >
            Nhập từ Excel
            <ChevronDown size={14} />
          </Button>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="relative w-72">
            <Input placeholder="Nhập mã/tên và chọn" value={search} onChange={(e) => setSearch(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {suggestions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => addRow(f)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{f.name}</span>
                    <span className="text-xs text-slate-400">{f.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có dòng nào</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Đồ thành phẩm/món</th>
                  <th className="border border-slate-200 px-3 py-2">Đơn vị</th>
                  <th className="border border-slate-200 px-3 py-2">SL đã bán</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.finishedGoodItemId}>
                    <td className="border border-slate-200 px-3 py-2">{row.item.name}</td>
                    <td className="border border-slate-200 px-3 py-2">{row.item.unit?.name}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-28"
                        value={row.quantitySold}
                        onChange={(e) => updateRow(row.finishedGoodItemId, e.target.value)}
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.finishedGoodItemId)}
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
        <Button onClick={handleSubmit} disabled={createCostCheck.isPending}>
          {createCostCheck.isPending ? "Đang lưu..." : "Lưu phiếu Check Cost"}
        </Button>
      </div>

      {importOpen && (
        <Modal title="Nhập SL đã bán từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              File theo đúng cột trong file mẫu: Tên đồ thành phẩm/món, SL đã bán. Dữ liệu đã có trong bảng sẽ được cập nhật;
              chưa có sẽ tự động thêm vào.
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
