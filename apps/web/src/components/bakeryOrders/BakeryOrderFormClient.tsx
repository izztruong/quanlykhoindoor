"use client";

import { BackToListLink } from "@/components/ui/BackToListLink";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useBakeryOrderOptions, useCreateBakeryOrder } from "@/hooks/useBakeryOrders";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { todayForDateInput } from "@/lib/dateRange";
import { useCan } from "@/lib/permissions";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Row {
  productId: string;
  orderedQty: string;
  note: string;
}

export function BakeryOrderFormClient() {
  const router = useRouter();
  const { user, scopeAll } = useCan();
  const createOrder = useCreateBakeryOrder();

  // Tài khoản quán tự đặt cho mình; người có phạm vi mọi quán (admin) phải chọn quán đặt hộ.
  const ordersForSelf = Boolean(user?.isShop) && !scopeAll;
  const { data: shops = [] } = useUserOptions({ scope: "shopOnly", enabled: !ordersForSelf });
  const [shopUserId, setShopUserId] = useState("");
  const effectiveShopId = ordersForSelf ? undefined : shopUserId;
  const { data: options, isLoading: optionsLoading } = useBakeryOrderOptions(effectiveShopId, ordersForSelf || Boolean(shopUserId));

  const [supplierId, setSupplierId] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(todayForDateInput());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  const bakery = options?.bakeries.find((b) => b.supplierId === supplierId);
  const products = bakery?.products ?? [];
  const chosen = new Set(rows.map((r) => r.productId));

  function changeShop(value: string) {
    // Danh sách bánh đặt được phụ thuộc quán, nên đổi quán là phải chọn lại từ đầu.
    setShopUserId(value);
    setSupplierId("");
    setRows([]);
  }

  function changeBakery(value: string) {
    setSupplierId(value);
    setRows([]);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleSubmit() {
    setError("");
    if (!ordersForSelf && !shopUserId) return setError("Chọn quán đặt");
    if (!supplierId) return setError("Chọn tiệm bánh");
    if (!deliveryOn) return setError("Chọn ngày cần giao");
    const items = rows.filter((r) => r.productId);
    if (items.length === 0) return setError("Thêm ít nhất 1 loại bánh");
    const invalid = items.find((r) => !(Number(r.orderedQty.replace(",", ".")) > 0));
    if (invalid) return setError("Số lượng đặt phải lớn hơn 0 ở mọi dòng");

    createOrder.mutate(
      {
        shopUserId: effectiveShopId,
        supplierId,
        deliveryOn,
        note: note || undefined,
        items: items.map((r) => ({ productId: r.productId, orderedQty: Number(r.orderedQty.replace(",", ".")), note: r.note || undefined })),
      },
      {
        onSuccess: (order) => router.push(`/bakery-orders/${order.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Đặt bánh thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackToListLink href="/bakery-orders" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách order bánh
      </BackToListLink>
      <h1 className="text-xl font-semibold text-slate-800">Đặt bánh</h1>

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {!ordersForSelf && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Quán đặt</label>
              <Select value={shopUserId} onChange={(e) => changeShop(e.target.value)}>
                <option value="">Chọn quán</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Tiệm bánh</label>
            <Select value={supplierId} onChange={(e) => changeBakery(e.target.value)} disabled={!options}>
              <option value="">{optionsLoading ? "Đang tải..." : "Chọn tiệm bánh"}</option>
              {options?.bakeries.map((b) => (
                <option key={b.supplierId} value={b.supplierId}>
                  {b.name}
                </option>
              ))}
            </Select>
            {options && options.bakeries.length === 0 && (
              <p className="text-xs text-amber-600">
                Chưa có tiệm bánh nào. Admin cần nối NCC với tài khoản tiệm bánh ở Danh mục → Nhà cung cấp.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Ngày cần giao</label>
            <Input type="date" value={deliveryOn} onChange={(e) => setDeliveryOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className="text-sm font-medium text-slate-600">Ghi chú</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Bánh đặt</CardTitle>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!bakery || rows.length >= products.length}
            onClick={() => setRows((prev) => [...prev, { productId: "", orderedQty: "", note: "" }])}
          >
            Thêm dòng
          </Button>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase text-slate-500">
                <th className="border border-slate-200 px-4 py-2">Bánh</th>
                <th className="w-32 border border-slate-200 px-4 py-2">SL đặt</th>
                <th className="border border-slate-200 px-4 py-2">Ghi chú</th>
                <th className="w-12 border border-slate-200 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const unit = products.find((p) => p.id === row.productId)?.unit?.name;
                return (
                  <tr key={index}>
                    <td className="border border-slate-200 px-4 py-2">
                      <Select value={row.productId} onChange={(e) => updateRow(index, { productId: e.target.value })}>
                        <option value="">Chọn bánh</option>
                        {products
                          .filter((p) => p.id === row.productId || !chosen.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Input inputMode="decimal" value={row.orderedQty} onChange={(e) => updateRow(index, { orderedQty: e.target.value })} />
                        {unit && <span className="text-xs text-slate-500">{unit}</span>}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-4 py-2">
                      <Input value={row.note} onChange={(e) => updateRow(index, { note: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-4 py-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="border border-slate-200 px-4 py-3 text-slate-400" colSpan={4}>
                    {bakery
                      ? products.length === 0
                        ? "Tiệm bánh này chưa có bánh nào quán đặt được (cần khai giá ở bảng giá NCC)."
                        : "Bấm “Thêm dòng” để chọn bánh."
                      : "Chọn tiệm bánh trước."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <BackToListLink href="/bakery-orders">
          <Button type="button" variant="secondary">
            Huỷ
          </Button>
        </BackToListLink>
        <Button type="button" onClick={handleSubmit} disabled={createOrder.isPending}>
          {createOrder.isPending ? "Đang lưu..." : "Đặt bánh"}
        </Button>
      </div>
    </div>
  );
}
