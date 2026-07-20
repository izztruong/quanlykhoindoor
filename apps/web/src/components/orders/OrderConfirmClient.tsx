"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useSuppliers } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useConfirmSalesOrderWithExport, useSalesOrder } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import type { SalesOrderItem } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SplitLine {
  key: string;
  supplierId: string;
  costPrice: string;
  quantity: string;
}

let splitLineCounter = 0;
function nextSplitLineKey() {
  splitLineCounter += 1;
  return `split-${splitLineCounter}`;
}

export function OrderConfirmClient({ id }: { id: string }) {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data: order, isLoading } = useSalesOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const { data: prices = [] } = useProductSupplierPrices();
  const confirmOrder = useConfirmSalesOrderWithExport(id);
  const [linesByItemId, setLinesByItemId] = useState<Record<string, SplitLine[]>>({});
  const [error, setError] = useState<string | null>(null);

  if (currentUser && currentUser.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  if (isLoading || !order) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  if (order.status !== "DRAFT") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-500">Đơn hàng này đã được xác nhận rồi.</p>
        <Link href={`/orders/${id}`} className="text-sm text-indigo-600 hover:underline">
          ← Xem chi tiết đơn hàng
        </Link>
      </div>
    );
  }

  function linesFor(item: SalesOrderItem): SplitLine[] {
    return linesByItemId[item.id] ?? [{ key: "default", supplierId: "", costPrice: "", quantity: String(item.quantity) }];
  }

  function setLines(itemId: string, lines: SplitLine[]) {
    setError(null);
    setLinesByItemId((prev) => ({ ...prev, [itemId]: lines }));
  }

  function updateLine(item: SalesOrderItem, key: string, patch: Partial<SplitLine>) {
    setLines(
      item.id,
      linesFor(item).map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function addLine(item: SalesOrderItem) {
    setLines(item.id, [...linesFor(item), { key: nextSplitLineKey(), supplierId: "", costPrice: "", quantity: "" }]);
  }

  function removeLine(item: SalesOrderItem, key: string) {
    const current = linesFor(item);
    if (current.length <= 1) return;
    setLines(
      item.id,
      current.filter((l) => l.key !== key),
    );
  }

  function suppliersForProduct(productId: string) {
    const supplierIds = new Set(prices.filter((p) => p.productId === productId).map((p) => p.supplierId));
    return suppliers.filter((s) => supplierIds.has(s.id));
  }

  function setLineSupplier(item: SalesOrderItem, key: string, supplierId: string) {
    const price = prices.find((p) => p.productId === item.productId && p.supplierId === supplierId);
    updateLine(item, key, price ? { supplierId, costPrice: String(price.exportPrice) } : { supplierId });
  }

  function allocatedFor(item: SalesOrderItem): number {
    return linesFor(item).reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  function handleSubmit() {
    setError(null);

    const items = order!.items.flatMap((item) =>
      // Giữ lại các dòng người dùng đã thực sự nhập số lượng (kể cả 0 — nghĩa là
      // không đặt được hàng hoá đó từ NCC nào), chỉ bỏ những dòng chia thêm mà
      // chưa ai điền gì.
      linesFor(item)
        .filter((line) => line.quantity.trim() !== "")
        .map((line) => ({
          itemId: item.id,
          supplierId: line.supplierId || undefined,
          costPrice: line.costPrice.trim() === "" ? 0 : Number(line.costPrice),
          quantity: Number(line.quantity),
        })),
    );

    confirmOrder.mutate(items, {
      onSuccess: () => router.replace(`/orders/${id}`),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xác nhận đơn hàng thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/orders/${id}`} className="self-start text-sm text-indigo-600 hover:underline">
          ← Đơn hàng {order.code}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Xác nhận đơn & tạo phiếu xuất kho</h1>
        <p className="text-sm text-slate-500">
          Chọn nhà cung cấp và xác nhận giá xuất, số lượng thực tế đặt được từ mỗi NCC cho từng hàng hoá (không cần khớp đúng
          số lượng đặt) — bấm <Plus className="inline" size={14} /> để chia 1 hàng hoá cho nhiều nhà cung cấp khác nhau. Xác
          nhận xong sẽ tự động tạo phiếu xuất kho gắn với đơn hàng này và chờ nhân viên xác nhận lại số lượng.
        </p>
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-slate-400">Kho xuất</div>
            <div className="font-medium text-slate-800">{order.warehouse.name}</div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hàng hoá</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {order.items.map((item) => {
            const lines = linesFor(item);
            const allocated = allocatedFor(item);
            const options = suppliersForProduct(item.productId);
            return (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <div className="font-medium text-slate-800">{item.product.name}</div>
                  <div className="text-slate-500">
                    Số lượng đặt: {formatNumber(item.quantity)} {item.product.unit?.name ?? ""}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {lines.map((line, index) => (
                    <div key={line.key} className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">Nhà cung cấp</label>
                        <Select
                          className="h-9 w-44"
                          value={line.supplierId}
                          onChange={(e) => setLineSupplier(item, line.key, e.target.value)}
                        >
                          <option value="">Không chọn</option>
                          {options.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500">Số lượng</label>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className="h-9 w-24"
                          value={line.quantity}
                          onChange={(e) => updateLine(item, line.key, { quantity: e.target.value })}
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
                          onChange={(e) => updateLine(item, line.key, { costPrice: e.target.value })}
                        />
                      </div>
                      {index === lines.length - 1 && (
                        <button
                          type="button"
                          onClick={() => addLine(item)}
                          title="Chia cho nhà cung cấp khác"
                          className="mb-1 rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"
                        >
                          <Plus size={16} />
                        </button>
                      )}
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(item, line.key)}
                          className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-2 text-xs font-medium text-slate-500">
                  Tổng số lượng đã nhập: {formatNumber(allocated)} (số lượng đặt ban đầu: {formatNumber(item.quantity)})
                </p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={confirmOrder.isPending}>
          {confirmOrder.isPending ? "Đang lưu..." : "Xác nhận & tạo phiếu xuất kho"}
        </Button>
      </div>
    </div>
  );
}
