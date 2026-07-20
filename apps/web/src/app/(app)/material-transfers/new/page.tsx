"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers } from "@/hooks/useCatalog";
import { useCreateMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useUsers } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import type { Product } from "@/types";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface MaterialRow {
  productId: string;
  product: Product;
  wholeQuantity: string;
  looseQuantity: string;
  supplierId: string;
  costPrice: string;
  note: string;
}

function nowForDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewMaterialTransferPage() {
  const router = useRouter();
  const { data: users = [] } = useUsers();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: prices = [] } = useProductSupplierPrices();
  const createTransfer = useCreateMaterialTransfer();

  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [transferAt, setTransferAt] = useState(nowForDatetimeLocal);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => !rowIds.has(p.id) && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 8);
  }, [search, products, rowIds]);

  function addRow(product: Product) {
    setRows((prev) =>
      prev.some((r) => r.productId === product.id)
        ? prev
        : [...prev, { productId: product.id, product, wholeQuantity: "", looseQuantity: "", supplierId: "", costPrice: "", note: "" }],
    );
    setSearch("");
  }

  function updateRow(productId: string, patch: Partial<MaterialRow>) {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  }

  function setRowSupplier(row: MaterialRow, supplierId: string) {
    const price = prices.find((p) => p.productId === row.productId && p.supplierId === supplierId);
    updateRow(row.productId, price ? { supplierId, costPrice: String(price.exportPrice) } : { supplierId });
  }

  function suppliersForProduct(productId: string) {
    const supplierIds = new Set(prices.filter((p) => p.productId === productId).map((p) => p.supplierId));
    return suppliers.filter((s) => supplierIds.has(s.id));
  }

  function removeRow(productId: string) {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  function handleSubmit() {
    setError(null);
    if (!fromUserId || !toUserId) {
      setError("Vui lòng chọn quán gửi và quán nhận.");
      return;
    }
    if (fromUserId === toUserId) {
      setError("Quán gửi và quán nhận phải khác nhau.");
      return;
    }
    const items = rows
      .filter((r) => r.wholeQuantity !== "" || r.looseQuantity !== "")
      .map((r) => ({
        productId: r.productId,
        wholeQuantity: r.wholeQuantity !== "" ? Number(r.wholeQuantity) : undefined,
        looseQuantity: r.looseQuantity !== "" ? Number(r.looseQuantity) : undefined,
        supplierId: r.supplierId || undefined,
        costPrice: r.costPrice !== "" ? Number(r.costPrice) : undefined,
        note: r.note || undefined,
      }));

    if (items.length === 0) {
      setError("Vui lòng thêm ít nhất 1 dòng nguyên liệu.");
      return;
    }

    createTransfer.mutate(
      {
        fromUserId,
        toUserId,
        transferAt: transferAt ? new Date(transferAt).toISOString() : undefined,
        note: note || undefined,
        items,
      },
      {
        onSuccess: (created) => router.push(`/material-transfers/${created.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu điều chuyển thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/material-transfers" className="self-start text-sm text-indigo-600 hover:underline">
          ← Danh sách phiếu điều chuyển
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Tạo phiếu điều chuyển</h1>
        <p className="text-sm text-slate-500">
          Chuyển nguyên liệu trực tiếp giữa 2 quán, không qua kho trung tâm. NCC/giá vốn không bắt buộc — chỉ để tham khảo
          sau này.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán gửi</label>
            <Select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)}>
              <option value="">Chọn quán gửi</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán nhận</label>
            <Select value={toUserId} onChange={(e) => setToUserId(e.target.value)}>
              <option value="">Chọn quán nhận</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Thời gian điều chuyển</label>
            <Input type="datetime-local" value={transferAt} onChange={(e) => setTransferAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className="text-sm font-medium text-slate-600">Ghi chú</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc)" />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nguyên liệu điều chuyển</CardTitle>
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
                  <th className="border border-slate-200 px-3 py-2">SL chẵn</th>
                  <th className="border border-slate-200 px-3 py-2">SL lẻ</th>
                  <th className="border border-slate-200 px-3 py-2">NCC (tuỳ chọn)</th>
                  <th className="border border-slate-200 px-3 py-2">Giá vốn</th>
                  <th className="border border-slate-200 px-3 py-2">Ghi chú</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId}>
                    <td className="border border-slate-200 px-3 py-2">
                      {row.product.name}
                      <div className="text-xs text-slate-400">{row.product.unit?.name}</div>
                    </td>
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
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Select className="h-8 w-36" value={row.supplierId} onChange={(e) => setRowSupplier(row, e.target.value)}>
                        <option value="">Không chọn</option>
                        {suppliersForProduct(row.productId).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8 w-24"
                        value={row.costPrice}
                        onChange={(e) => updateRow(row.productId, { costPrice: e.target.value })}
                      />
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={createTransfer.isPending}>
          {createTransfer.isPending ? "Đang lưu..." : "Lưu phiếu điều chuyển"}
        </Button>
      </div>
    </div>
  );
}
