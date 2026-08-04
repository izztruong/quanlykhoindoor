"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateMaterialWaste, useUpdateMaterialWaste } from "@/hooks/useMaterialWaste";
import { ApiError } from "@/lib/api-client";
import { nowForDatetimeLocal } from "@/lib/dateRange";
import { formatNumber } from "@/lib/format";
import { filterSuggestions } from "@/lib/searchSuggestions";
import type { FinishedGoodItem, MaterialWaste, Product } from "@/types";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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

function toMaterialRows(waste?: MaterialWaste): MaterialRow[] {
  return (waste?.items ?? []).map((it) => ({
    productId: it.productId,
    product: it.product,
    wholeQuantity: it.wholeQuantity != null ? String(Number(it.wholeQuantity)) : "",
    looseQuantity: it.looseQuantity != null ? String(Number(it.looseQuantity)) : "",
    note: it.note ?? "",
  }));
}

function toFinishedRows(waste?: MaterialWaste): FinishedRow[] {
  return (waste?.finishedItems ?? []).map((it) => ({
    finishedGoodItemId: it.finishedGoodItemId,
    item: it.finishedGoodItem,
    quantity: it.quantity != null ? String(Number(it.quantity)) : "",
    note: it.note ?? "",
  }));
}

interface MaterialWasteFormClientProps {
  /** Phiếu hiện có — truyền vào để vào chế độ sửa; để trống là tạo mới. */
  existing?: MaterialWaste;
}

export function MaterialWasteFormClient({ existing }: MaterialWasteFormClientProps) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createWaste = useCreateMaterialWaste();
  const updateWaste = useUpdateMaterialWaste(existing?.id ?? "");

  const [wasteAt, setWasteAt] = useState(() => (existing ? existing.wasteAt.slice(0, 16) : nowForDatetimeLocal()));
  const [note, setNote] = useState(existing?.note ?? "");
  const [rows, setRows] = useState<MaterialRow[]>(() => toMaterialRows(existing));
  const [finishedRows, setFinishedRows] = useState<FinishedRow[]>(() => toFinishedRows(existing));
  const [search, setSearch] = useState("");
  const [finishedSearch, setFinishedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);
  const suggestions = useMemo(() => filterSuggestions(products, rowIds, search), [search, products, rowIds]);

  const finishedRowIds = useMemo(() => new Set(finishedRows.map((r) => r.finishedGoodItemId)), [finishedRows]);
  const finishedSuggestions = useMemo(
    () => filterSuggestions(finishedGoodItems, finishedRowIds, finishedSearch),
    [finishedSearch, finishedGoodItems, finishedRowIds],
  );

  function addRow(product: Product) {
    setRows((prev) =>
      prev.some((r) => r.productId === product.id) ? prev : [...prev, { productId: product.id, product, wholeQuantity: "", looseQuantity: "", note: "" }],
    );
    setSearch("");
  }

  function updateRow(productId: string, patch: Partial<MaterialRow>) {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  }

  function removeRow(productId: string) {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  function addFinishedRow(item: FinishedGoodItem) {
    setFinishedRows((prev) =>
      prev.some((r) => r.finishedGoodItemId === item.id) ? prev : [...prev, { finishedGoodItemId: item.id, item, quantity: "", note: "" }],
    );
    setFinishedSearch("");
  }

  function updateFinishedRow(finishedGoodItemId: string, patch: Partial<FinishedRow>) {
    setFinishedRows((prev) => prev.map((r) => (r.finishedGoodItemId === finishedGoodItemId ? { ...r, ...patch } : r)));
  }

  function removeFinishedRow(finishedGoodItemId: string) {
    setFinishedRows((prev) => prev.filter((r) => r.finishedGoodItemId !== finishedGoodItemId));
  }

  function handleSubmit() {
    setError(null);
    const items = rows
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

    const payload = { wasteAt: wasteAt ? new Date(wasteAt).toISOString() : undefined, note: note || undefined, items, finishedItems };

    if (isEdit && existing) {
      updateWaste.mutate(payload, {
        onSuccess: (updated) => {
          if (updated.affectedCostChecks.length > 0) {
            const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
            router.push(`/material-waste/${existing.id}`);
            alert(
              `Đã lưu phiếu. Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
            );
            return;
          }
          router.push(`/material-waste/${existing.id}`);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu huỷ thất bại"),
      });
      return;
    }

    createWaste.mutate(payload, {
      onSuccess: () => router.push("/material-waste"),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu huỷ thất bại"),
    });
  }

  const isPending = isEdit ? updateWaste.isPending : createWaste.isPending;
  const backHref = isEdit && existing ? `/material-waste/${existing.id}` : "/material-waste";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={backHref} className="self-start text-sm text-indigo-600 hover:underline">
          ← {isEdit ? "Chi tiết phiếu huỷ" : "Danh sách phiếu huỷ"}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">{isEdit ? `Sửa phiếu ${existing?.code}` : "Tạo phiếu huỷ nguyên liệu"}</h1>
        <p className="text-sm text-slate-500">Có thể chọn lại thời gian huỷ thực tế nếu khác lúc lưu phiếu.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Thời gian huỷ</label>
            <Input type="datetime-local" value={wasteAt} onChange={(e) => setWasteAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Ghi chú</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nguyên liệu huỷ</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="relative w-72">
            <Input placeholder="Nhập mã/tên và chọn" value={search} onChange={(e) => setSearch(e.target.value)} />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addRow(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="text-slate-700">{p.name}</span>
                    <span className="text-xs text-slate-400">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">Chưa có nguyên liệu nào được chọn</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Nguyên liệu</th>
                  <th className="border border-slate-200 px-3 py-2">Đơn vị</th>
                  <th className="border border-slate-200 px-3 py-2">SL chẵn</th>
                  <th className="border border-slate-200 px-3 py-2">SL lẻ</th>
                  <th className="border border-slate-200 px-3 py-2">Ghi chú</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId}>
                    <td className="border border-slate-200 px-3 py-2">{row.product.name}</td>
                    <td className="border border-slate-200 px-3 py-2">{row.product.unit?.name}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-24"
                        value={row.wholeQuantity}
                        onChange={(e) => updateRow(row.productId, { wholeQuantity: e.target.value })}
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
                            value={row.looseQuantity}
                            onChange={(e) => updateRow(row.productId, { looseQuantity: e.target.value })}
                          />
                          {row.product.recipeUnit?.name && <span className="text-xs text-slate-400">{row.product.recipeUnit.name}</span>}
                        </div>
                        {row.product.tareWeight != null && Number(row.product.tareWeight) > 0 && (
                          <span className="text-xs text-amber-600">
                            Cân cả vỏ — tự trừ {formatNumber(row.product.tareWeight)}
                            {row.product.recipeUnit?.name}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input className="h-8 w-40" value={row.note} onChange={(e) => updateRow(row.productId, { note: e.target.value })} />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.productId)}
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
          <CardTitle>Đồ thành phẩm huỷ</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="relative w-72">
            <Input placeholder="Nhập mã/tên và chọn" value={finishedSearch} onChange={(e) => setFinishedSearch(e.target.value)} />
            {finishedSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                {finishedSuggestions.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => addFinishedRow(f)}
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
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Đồ thành phẩm</th>
                  <th className="border border-slate-200 px-3 py-2">Đơn vị</th>
                  <th className="border border-slate-200 px-3 py-2">Số lượng</th>
                  <th className="border border-slate-200 px-3 py-2">Ghi chú</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {finishedRows.map((row) => (
                  <tr key={row.finishedGoodItemId}>
                    <td className="border border-slate-200 px-3 py-2">{row.item.name}</td>
                    <td className="border border-slate-200 px-3 py-2">{row.item.unit?.name}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        className="h-8 w-28"
                        value={row.quantity}
                        onChange={(e) => updateFinishedRow(row.finishedGoodItemId, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        className="h-8 w-40"
                        value={row.note}
                        onChange={(e) => updateFinishedRow(row.finishedGoodItemId, { note: e.target.value })}
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
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
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Lưu phiếu huỷ"}
        </Button>
      </div>
    </div>
  );
}
