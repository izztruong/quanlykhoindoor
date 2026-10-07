"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useProcessSalesOrder, useSalesOrder, type SalesOrderProcessItemInput } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { nowForDatetimeLocal, toDatetimeLocal } from "@/lib/dateRange";
import { formatNumber } from "@/lib/format";
import { filterSuggestions } from "@/lib/searchSuggestions";
import type { Product, SalesOrder } from "@/types";
import { Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface SplitLine {
  key: string;
  supplierId: string;
  costPrice: string;
  quantity: string;
}

/** Một hàng hoá trên màn xử lý: hàng quán đã đặt (itemId) hoặc hàng admin thêm mới (chỉ có product). */
interface ProcessRow {
  key: string;
  itemId?: string;
  product: Product;
  /** SL quán đặt; null = hàng admin tự thêm. */
  orderedQty: number | null;
  lines: SplitLine[];
  note: string;
  /** Rỗng = dùng ngày mặc định ở đầu bảng. */
  receivedAt: string;
}

let keyCounter = 0;
function nextKey(prefix: string) {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

function emptyLine(quantity = ""): SplitLine {
  return { key: nextKey("line"), supplierId: "", costPrice: "", quantity };
}

/**
 * Lần đầu (DRAFT, chưa có phiếu xuất) thì mỗi hàng một dòng NCC trống với SL = SL đặt. Đơn đã xử lý
 * thì dựng lại đúng các dòng NCC từ phiếu xuất — phiếu xuất là bản ghi duy nhất giữ NCC và giá.
 */
function initialRows(order: SalesOrder): ProcessRow[] {
  const exportLines = order.stockExport?.items ?? [];
  return order.items.map((item) => {
    const lines = exportLines
      .filter((line) => line.productId === item.productId)
      .map((line) => ({
        key: nextKey("line"),
        supplierId: line.supplierId ?? "",
        costPrice: Number(line.costPrice) ? String(Number(line.costPrice)) : "",
        quantity: String(Number(line.quantity)),
      }));
    const fallbackQty = item.receivedQuantity != null ? Number(item.receivedQuantity) : Number(item.quantity);
    return {
      key: item.id,
      itemId: item.id,
      product: item.product,
      orderedQty: Number(item.quantity) > 0 ? Number(item.quantity) : null,
      lines: lines.length > 0 ? lines : [emptyLine(String(fallbackQty))],
      note: item.note ?? "",
      receivedAt: item.receivedAt ? toDatetimeLocal(item.receivedAt) : "",
    };
  });
}

export function OrderProcessClient({ id }: { id: string }) {
  const { data: order, isLoading } = useSalesOrder(id);

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  if (order.status === "CANCELLED") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">Đơn hàng này đã huỷ.</p>
        <Link href={`/orders/${id}`} className="text-sm text-indigo-600 hover:underline">
          ← Xem chi tiết đơn hàng
        </Link>
      </div>
    );
  }

  // Tách component để state khởi tạo một lần từ dữ liệu đơn đã tải xong.
  return <OrderProcessForm order={order} />;
}

function OrderProcessForm({ order }: { order: SalesOrder }) {
  const router = useRouter();
  const { data: suppliers = [] } = useSuppliers();
  const { data: prices = [] } = useProductSupplierPrices();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const processOrder = useProcessSalesOrder(order.id);
  const isEdit = order.status === "COMPLETED";

  const [rows, setRows] = useState<ProcessRow[]>(() => initialRows(order));
  const [bulkReceivedAt, setBulkReceivedAt] = useState(nowForDatetimeLocal);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rowProductIds = useMemo(() => new Set(rows.map((r) => r.product.id)), [rows]);
  const suggestions = useMemo(() => filterSuggestions(products, rowProductIds, search), [products, rowProductIds, search]);

  function updateRow(key: string, patch: Partial<ProcessRow>) {
    setError(null);
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateLine(row: ProcessRow, lineKey: string, patch: Partial<SplitLine>) {
    updateRow(row.key, { lines: row.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) });
  }

  function suppliersForProduct(productId: string) {
    const supplierIds = new Set(prices.filter((p) => p.productId === productId).map((p) => p.supplierId));
    return suppliers.filter((s) => supplierIds.has(s.id));
  }

  function setLineSupplier(row: ProcessRow, lineKey: string, supplierId: string) {
    const price = prices.find((p) => p.productId === row.product.id && p.supplierId === supplierId);
    updateLine(row, lineKey, price ? { supplierId, costPrice: String(price.exportPrice) } : { supplierId });
  }

  function addProduct(product: Product) {
    setError(null);
    setRows((prev) => [
      ...prev,
      { key: nextKey("new"), product, orderedQty: null, lines: [emptyLine()], note: "", receivedAt: "" },
    ]);
    setSearch("");
  }

  function applyBulkDateToAll() {
    setError(null);
    setRows((prev) => prev.map((r) => ({ ...r, receivedAt: bulkReceivedAt })));
  }

  function handleSubmit() {
    setError(null);

    const items: SalesOrderProcessItemInput[] = [];
    for (const row of rows) {
      // Bỏ những dòng NCC chưa điền SL; còn lại không dòng nào thì gửi một dòng SL 0 (= không nhận được).
      const lines = row.lines
        .filter((line) => line.quantity.trim() !== "")
        .map((line) => ({
          supplierId: line.supplierId || undefined,
          costPrice: line.costPrice.trim() === "" ? 0 : Number(line.costPrice),
          quantity: Number(line.quantity),
        }));
      if (lines.some((line) => Number.isNaN(line.quantity) || Number.isNaN(line.costPrice))) {
        setError(`Số lượng hoặc giá của "${row.product.name}" không hợp lệ.`);
        return;
      }
      if (!row.itemId && lines.reduce((sum, l) => sum + l.quantity, 0) <= 0) {
        setError(`Nhập số lượng nhận cho hàng thêm mới "${row.product.name}", hoặc xoá hàng đó đi.`);
        return;
      }
      const dateValue = row.receivedAt || bulkReceivedAt;
      items.push({
        itemId: row.itemId,
        productId: row.itemId ? undefined : row.product.id,
        receivedAt: dateValue ? new Date(dateValue).toISOString() : undefined,
        note: row.note.trim() || undefined,
        lines: lines.length > 0 ? lines : [{ costPrice: 0, quantity: 0 }],
      });
    }

    processOrder.mutate(items, {
      onSuccess: (updated) => {
        router.replace(`/orders/${order.id}`);
        if (updated.affectedCostChecks.length > 0) {
          const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
          alert(
            `Đã lưu. Các phiếu Check Cost sau có kỳ trùm ngày nhận cũ hoặc mới — số liệu của chúng CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
          );
        }
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu đơn hàng thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/orders/${order.id}`} className="self-start text-sm text-indigo-600 hover:underline">
          ← Đơn hàng {order.code}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">{isEdit ? "Sửa nhận hàng" : "Xử lý đơn hàng"}</h1>
        <p className="text-sm text-slate-500">
          Nhập nhà cung cấp, giá xuất và số lượng thực nhận cho từng hàng hoá — bấm <Plus className="inline" size={14} /> để
          chia một hàng hoá cho nhiều nhà cung cấp. Lưu xong đơn chuyển sang Hoàn thành và phiếu xuất kho được ghi lại theo
          đúng các dòng này; về sau vẫn sửa lại được.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-400">Tài khoản</div>
            <div className="font-medium text-slate-800">{order.createdBy?.name ?? "-"}</div>
          </div>
          <div>
            <div className="text-slate-400">Kho xuất</div>
            <div className="font-medium text-slate-800">{order.warehouse.name}</div>
          </div>
          <div>
            <div className="text-slate-400">Phiếu xuất kho</div>
            <div className="font-medium text-slate-800">{order.stockExport ? order.stockExport.code : "Tạo khi lưu"}</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hàng hoá</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">Ngày nhận mặc định</label>
              <Input
                type="datetime-local"
                className="h-8 w-52"
                value={bulkReceivedAt}
                onChange={(e) => setBulkReceivedAt(e.target.value)}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={applyBulkDateToAll}>
              Áp ngày cho tất cả
            </Button>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {rows.map((row) => {
            const total = row.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
            const options = suppliersForProduct(row.product.id);
            return (
              <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <div className="font-medium text-slate-800">
                    {row.product.name}
                    {!row.itemId && <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-600">Thêm mới</span>}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span>
                      Số lượng đặt: {row.orderedQty != null ? formatNumber(row.orderedQty) : "—"} {row.product.unit?.name ?? ""}
                    </span>
                    {!row.itemId && (
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        title="Bỏ hàng thêm mới"
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {row.lines.map((line, index) => (
                    <div key={line.key} className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">Nhà cung cấp</label>
                        <Select className="h-9 w-44" value={line.supplierId} onChange={(e) => setLineSupplier(row, line.key, e.target.value)}>
                          <option value="">Không chọn</option>
                          {options.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">SL nhận</label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className="h-9 w-24"
                          value={line.quantity}
                          onChange={(e) => updateLine(row, line.key, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">Giá xuất</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-9 w-28"
                          value={line.costPrice}
                          onChange={(e) => updateLine(row, line.key, { costPrice: e.target.value })}
                        />
                      </div>
                      {index === row.lines.length - 1 && (
                        <button
                          type="button"
                          onClick={() => updateRow(row.key, { lines: [...row.lines, emptyLine()] })}
                          title="Chia cho nhà cung cấp khác"
                          className="mb-1 rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                        >
                          <Plus size={16} />
                        </button>
                      )}
                      {row.lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => updateRow(row.key, { lines: row.lines.filter((l) => l.key !== line.key) })}
                          className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p
                  className={`mt-2 text-xs font-medium ${
                    row.orderedQty != null && total < row.orderedQty
                      ? "text-red-600"
                      : row.orderedQty != null && total > row.orderedQty
                        ? "text-emerald-600"
                        : "text-slate-500"
                  }`}
                >
                  Tổng số lượng nhận: {formatNumber(total)}
                  {row.orderedQty != null && ` (đặt ${formatNumber(row.orderedQty)})`}
                </p>

                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Ghi chú</label>
                    <Input
                      value={row.note}
                      onChange={(e) => updateRow(row.key, { note: e.target.value })}
                      placeholder="Ví dụ: NCC hết hàng, chỉ lấy được một phần..."
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Ngày nhận</label>
                    <Input
                      type="datetime-local"
                      className="w-52"
                      value={row.receivedAt || bulkReceivedAt}
                      onChange={(e) => updateRow(row.key, { receivedAt: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="relative w-72">
            <Input placeholder="Thêm hàng hoá: nhập mã/tên và chọn" value={search} onChange={(e) => setSearch(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={processOrder.isPending}>
          {processOrder.isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Lưu & hoàn thành đơn"}
        </Button>
      </div>
    </div>
  );
}
