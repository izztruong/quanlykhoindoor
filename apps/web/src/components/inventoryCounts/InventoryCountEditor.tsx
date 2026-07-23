"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProducts, useWarehouses } from "@/hooks/useCatalog";
import {
  useCancelInventoryCount,
  useCreateInventoryCountWithItems,
  useDeleteInventoryCountItem,
  useSaveInventoryCountItems,
} from "@/hooks/useInventoryCounts";
import { ApiError, api } from "@/lib/api-client";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import { formatNumber, labels } from "@/lib/format";
import type { InventoryCount, InventoryCountRow, Product } from "@/types";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import ExcelJS from "exceljs";
import { ChevronDown, Download, Layers, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const statusTone: Record<string, "gray" | "green" | "red" | "yellow" | "blue"> = {
  DRAFT: "gray",
  COMPLETED: "green",
  CANCELLED: "red",
};

interface Row {
  productId: string;
  product: Product;
  itemId?: string;
  actualQuantity: string;
  note: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function seedRowsFromCount(count: InventoryCount): Row[] {
  return (count.items ?? []).map((it) => ({
    productId: it.productId,
    product: it.product,
    itemId: it.id,
    actualQuantity: String(it.actualQuantity),
    note: it.note ?? "",
  }));
}

interface InventoryCountEditorProps {
  mode: "create" | "edit";
  count?: InventoryCount;
}

export function InventoryCountEditor({ mode, count }: InventoryCountEditorProps) {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: products = [] } = useProducts({ activeOnly: true });

  const [warehouseId, setWarehouseId] = useState(count?.warehouseId ?? "");
  const [countDate, setCountDate] = useState(count?.countDate.slice(0, 10) ?? today());
  const [note, setNote] = useState(count?.note ?? "");
  const [rows, setRows] = useState<Row[]>(count ? seedRowsFromCount(count) : []);

  const [search, setSearch] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const createWithItems = useCreateInventoryCountWithItems();
  const saveItems = useSaveInventoryCountItems(count?.id ?? "");
  const deleteItem = useDeleteInventoryCountItem(count?.id ?? "");
  const cancelCount = useCancelInventoryCount(count?.id ?? "");

  // A phiếu is locked for editing the moment it has been saved with items
  // (status leaves DRAFT) — once counted, the numbers become a fixed record;
  // only cancelling it is still allowed.
  const canEditItems = mode === "create" || count?.status === "DRAFT";
  const canCancel = mode === "edit" && count !== undefined && count.status !== "CANCELLED";

  function handleCancel() {
    if (!confirm("Huỷ phiếu kiểm kê này? Sau khi huỷ sẽ không thể chỉnh sửa hoặc hoàn tác.")) return;
    setError(null);
    cancelCount.mutate(undefined, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Huỷ phiếu thất bại"),
    });
  }

  const { data: systemReport } = useQuery({
    queryKey: ["reports", "inventory-count-system", warehouseId, countDate],
    queryFn: () => api.get<{ items: InventoryCountRow[] }>("/reports/inventory-count", { warehouseId, from: countDate, to: countDate }),
    enabled: Boolean(warehouseId && countDate),
  });

  const systemQtyMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of systemReport?.items ?? []) m.set(r.product.id, r.systemQty);
    return m;
  }, [systemReport]);

  const rowProductIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !rowProductIds.has(p.id) && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, products, rowProductIds]);

  function addRow(product: Product) {
    setRows((prev) => (prev.some((r) => r.productId === product.id) ? prev : [...prev, { productId: product.id, product, actualQuantity: "", note: "" }]));
  }

  function updateRow(productId: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  }

  function removeRow(row: Row) {
    if (row.itemId) {
      deleteItem.mutate(row.itemId, { onSuccess: () => setRows((prev) => prev.filter((r) => r.productId !== row.productId)) });
    } else {
      setRows((prev) => prev.filter((r) => r.productId !== row.productId));
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && suggestions.length > 0) {
      e.preventDefault();
      addRow(suggestions[0]);
      setSearch("");
    }
  }

  const bulkCandidates = useMemo(() => {
    const q = bulkSearch.trim().toLowerCase();
    return products.filter((p) => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [bulkSearch, products]);

  function toggleBulk(productId: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function confirmBulkAdd() {
    for (const p of products) {
      if (bulkSelected.has(p.id)) addRow(p);
    }
    setBulkSelected(new Set());
    setBulkSearch("");
    setBulkOpen(false);
  }

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kiểm kê");
    sheet.columns = ["Mã hàng hoá*", "Tồn thực tế*", "Ghi chú"].map((header) => ({ header, width: 22 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([products[0]?.code ?? "SP001", 0, ""]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-kiem-ke.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const exportColumns: ExcelColumn<Row>[] = [
    { header: "STT", value: (_row, index) => index + 1, width: 6 },
    { header: "Mã hàng hoá", value: (row) => row.product.code },
    { header: "Tên hàng hoá", value: (row) => row.product.name },
    { header: "Đơn vị tính", value: (row) => row.product.unit?.name ?? "-" },
    { header: "Tồn hệ thống", value: (row) => systemQtyMap.get(row.productId) ?? 0 },
    { header: "Tồn thực tế", value: (row) => row.actualQuantity },
    { header: "Ghi chú", value: (row) => row.note },
  ];

  async function exportData() {
    setExcelMenuOpen(false);
    await exportRowsToExcel("Kiểm kê", exportColumns, rows, "kiem-ke.xlsx");
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

      const productByCode = new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
      const errors: string[] = [];
      let updated = 0;
      let added = 0;
      const nextRows = [...rows];
      const rowIndexByProductId = new Map(nextRows.map((r, index) => [r.productId, index]));

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const code = String(row.getCell(1).value ?? "").trim();
        const qtyRaw = row.getCell(2).value;
        const noteVal = String(row.getCell(3).value ?? "").trim();
        if (!code) return;

        const product = productByCode.get(code.toLowerCase());
        if (!product) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy hàng hoá có mã "${code}"`);
          return;
        }

        const qty = Number(qtyRaw);
        if (qtyRaw === null || qtyRaw === undefined || qtyRaw === "" || Number.isNaN(qty)) {
          errors.push(`Dòng ${rowNumber}: tồn thực tế không hợp lệ`);
          return;
        }

        const existingIndex = rowIndexByProductId.get(product.id);
        if (existingIndex !== undefined) {
          nextRows[existingIndex] = { ...nextRows[existingIndex], actualQuantity: String(qty), note: noteVal || nextRows[existingIndex].note };
          updated++;
        } else {
          nextRows.push({ productId: product.id, product, actualQuantity: String(qty), note: noteVal });
          rowIndexByProductId.set(product.id, nextRows.length - 1);
          added++;
        }
      });

      setRows(nextRows);
      setImportResult({ updated, added, errors });
    } catch {
      setImportResult({ updated: 0, added: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  function handleSave() {
    setError(null);
    setSuccess(false);

    if (mode === "create" && !warehouseId) {
      setError("Vui lòng chọn kho hàng.");
      return;
    }

    const items = rows
      .filter((r) => r.actualQuantity !== "" && !Number.isNaN(Number(r.actualQuantity)))
      .map((r) => ({ productId: r.productId, actualQuantity: Number(r.actualQuantity), note: r.note || undefined }));

    if (items.length === 0) {
      setError("Vui lòng thêm hàng hoá và nhập số lượng thực tế.");
      return;
    }

    if (mode === "create") {
      createWithItems.mutate(
        { header: { warehouseId, countDate, note: note || undefined }, items },
        {
          onSuccess: (created) => router.push(`/stock/inventory-counts/${created.id}`),
          onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu thất bại"),
        },
      );
    } else {
      saveItems.mutate(items, {
        onSuccess: () => setSuccess(true),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu kiểm kê thất bại"),
      });
    }
  }

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const base: ColumnDef<Row>[] = [
      { header: "STT", id: "stt", cell: ({ row }) => row.index + 1 },
      { header: "Mã hàng hoá", accessorFn: (r) => r.product.code, id: "code" },
      { header: "Tên hàng hoá", accessorFn: (r) => r.product.name, id: "name" },
      { header: "Đơn vị tính", accessorFn: (r) => r.product.unit?.name, id: "unit" },
      {
        header: "Tồn hệ thống",
        id: "systemQty",
        cell: ({ row }) => formatNumber(systemQtyMap.get(row.original.productId) ?? 0),
      },
      {
        header: "Tồn thực tế",
        id: "actualQty",
        cell: ({ row }) =>
          canEditItems ? (
            <Input
              type="number"
              step="0.001"
              min="0"
              className="h-8 w-28"
              value={row.original.actualQuantity}
              onChange={(e) => updateRow(row.original.productId, { actualQuantity: e.target.value })}
            />
          ) : (
            (row.original.actualQuantity || "-")
          ),
      },
      {
        header: "Chênh lệch",
        id: "diff",
        cell: ({ row }) => {
          const raw = row.original.actualQuantity;
          if (raw === "" || Number.isNaN(Number(raw))) return <span className="text-slate-400">-</span>;
          const diff = Number(raw) - (systemQtyMap.get(row.original.productId) ?? 0);
          if (diff === 0) return <span className="text-slate-500">Khớp</span>;
          if (diff > 0) return <span className="text-emerald-600">Thừa {formatNumber(diff)}</span>;
          return <span className="text-red-600">Thiếu {formatNumber(Math.abs(diff))}</span>;
        },
      },
      {
        header: "Ghi chú",
        id: "note",
        cell: ({ row }) =>
          canEditItems ? (
            <Input
              className="h-8 w-40"
              value={row.original.note}
              onChange={(e) => updateRow(row.original.productId, { note: e.target.value })}
            />
          ) : (
            (row.original.note || "-")
          ),
      },
    ];

    if (!canEditItems) return base;

    return [
      ...base,
      {
        header: "",
        id: "actions",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => removeRow(row.original)}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemQtyMap, canEditItems]);

  const isSaving = createWithItems.isPending || saveItems.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">{mode === "create" ? "Tạo phiếu kiểm kê" : `Phiếu kiểm kê ${count?.code}`}</h1>
            {count && <Badge tone={statusTone[count.status]}>{labels.inventoryCountStatus(count.status)}</Badge>}
          </div>
          <p className="text-sm text-slate-500">
            {canEditItems ? "Thêm hàng hoá cần kiểm và nhập số lượng thực tế đếm được." : "Phiếu đã lưu số liệu, không thể chỉnh sửa."}
          </p>
        </div>
        <div className="flex gap-2">
          {canCancel && (
            <Button variant="danger" onClick={handleCancel} disabled={cancelCount.isPending}>
              Huỷ phiếu
            </Button>
          )}
          {canEditItems && (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Đang lưu..." : "Lưu lại"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          {canEditItems && (
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3">
                <div className="relative w-72">
                  <Input
                    placeholder="Nhập mã/tên và ấn Enter"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                      {suggestions.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            addRow(p);
                            setSearch("");
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
                <Button type="button" variant="secondary" size="sm" onClick={() => setBulkOpen(true)}>
                  <Layers size={14} />
                  Thêm hàng loạt
                </Button>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Hàng hoá kiểm kê</CardTitle>
              <div className="relative" ref={excelMenuRef}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setExcelMenuOpen((o) => !o)}>
                  Nhập & xuất excel
                  <ChevronDown size={14} />
                </Button>
                {excelMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {canEditItems && (
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
                    )}
                    <button type="button" onClick={exportData} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                      Xuất dữ liệu
                    </button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <DataTable columns={columns} data={rows} emptyMessage="Chưa có hàng hoá nào được chọn" />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Kho hàng {mode === "create" && <span className="text-red-500">*</span>}</label>
              {mode === "create" ? (
                <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">Chọn kho hàng</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm font-medium text-slate-800">{count?.warehouse.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian kiểm kê</label>
              {mode === "create" ? (
                <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
              ) : (
                <p className="text-sm font-medium text-slate-800">{count?.countDate.slice(0, 10)}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              {mode === "create" ? (
                <textarea
                  className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-800">{count?.note || "-"}</p>
              )}
            </div>
            {count?.createdBy && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Người tạo</label>
                <p className="text-sm text-slate-800">{count.createdBy.name}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Đã lưu kết quả kiểm kê.</p>}

      {bulkOpen && (
        <Modal title="Thêm hàng loạt" onClose={() => setBulkOpen(false)}>
          <div className="flex flex-col gap-3">
            <Input placeholder="Tìm theo mã/tên" value={bulkSearch} onChange={(e) => setBulkSearch(e.target.value)} />
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              {bulkCandidates.map((p) => (
                <label key={p.id} className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={bulkSelected.has(p.id)}
                    onChange={() => toggleBulk(p.id)}
                    disabled={rowProductIds.has(p.id)}
                  />
                  <span className="flex-1 text-slate-700">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.code}</span>
                </label>
              ))}
              {bulkCandidates.length === 0 && <p className="p-3 text-sm text-slate-400">Không có hàng hoá phù hợp.</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setBulkOpen(false)}>
                Huỷ
              </Button>
              <Button type="button" onClick={confirmBulkAdd} disabled={bulkSelected.size === 0}>
                <Plus size={14} />
                Thêm {bulkSelected.size > 0 ? bulkSelected.size : ""} hàng hoá
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal title="Nhập số liệu kiểm kê từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Mã hàng hoá*, Tồn thực tế*, Ghi chú (cột có dấu * là bắt buộc
              phải điền). Hàng hoá đã có trong bảng sẽ được cập nhật số liệu; hàng hoá chưa có sẽ tự động được thêm vào.
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
                  Đã cập nhật {importResult.updated}, thêm mới {importResult.added} hàng hoá.
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
