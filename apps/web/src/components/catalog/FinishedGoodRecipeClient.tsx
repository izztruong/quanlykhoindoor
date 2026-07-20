"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useFinishedGoodRecipe, useUpdateFinishedGoodRecipe } from "@/hooks/useFinishedGoodRecipes";
import { ApiError } from "@/lib/api-client";
import type { Product } from "@/types";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface RecipeRow {
  productId: string;
  product: Product;
  quantityPerUnit: string;
}

export function FinishedGoodRecipeClient({ id }: { id: string }) {
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const { data: products = [] } = useProducts();
  const { data: recipeItems, isLoading } = useFinishedGoodRecipe(id);
  const updateRecipe = useUpdateFinishedGoodRecipe(id);

  const finishedGoodItem = finishedGoodItems.find((f) => f.id === id);

  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recipeItems && !initialized) {
      setRows(
        recipeItems.map((it) => ({ productId: it.productId, product: it.product, quantityPerUnit: String(it.quantityPerUnit) })),
      );
      setInitialized(true);
    }
  }, [recipeItems, initialized]);

  const rowIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => !rowIds.has(p.id) && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 8);
  }, [search, products, rowIds]);

  function addRow(product: Product) {
    setRows((prev) => (prev.some((r) => r.productId === product.id) ? prev : [...prev, { productId: product.id, product, quantityPerUnit: "" }]));
    setSearch("");
  }

  function updateRow(productId: string, quantityPerUnit: string) {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, quantityPerUnit } : r)));
  }

  function removeRow(productId: string) {
    setRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  function handleSubmit() {
    setError(null);
    const items = rows
      .filter((r) => r.quantityPerUnit.trim() !== "" && Number(r.quantityPerUnit) > 0)
      .map((r) => ({ productId: r.productId, quantityPerUnit: Number(r.quantityPerUnit) }));

    updateRecipe.mutate(items, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu công thức thất bại"),
    });
  }

  if (isLoading) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/catalog/finished-goods" className="self-start text-sm text-indigo-600 hover:underline">
          ← Đồ thành phẩm
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Công thức: {finishedGoodItem?.name ?? "..."}</h1>
        <p className="text-sm text-slate-500">
          Khai báo nguyên liệu và định lượng cần để làm ra 1 đơn vị ({finishedGoodItem?.unit?.name ?? "-"}). Định lượng nhập
          theo đơn vị quy đổi công thức của từng nguyên liệu (xem ở Danh mục → Hàng hoá), không phải đơn vị chính.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nguyên liệu</CardTitle>
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
            <p className="text-sm text-slate-400">Chưa có nguyên liệu nào trong công thức</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Nguyên liệu</th>
                  <th className="border border-slate-200 px-3 py-2">Định lượng / 1 đơn vị</th>
                  <th className="border border-slate-200 px-3 py-2">Đơn vị công thức</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId}>
                    <td className="border border-slate-200 px-3 py-2">{row.product.name}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        className="h-8 w-28"
                        value={row.quantityPerUnit}
                        onChange={(e) => updateRow(row.productId, e.target.value)}
                      />
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-500">{row.product.recipeUnit?.name ?? row.product.unit?.name ?? "-"}</td>
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
        <Button onClick={handleSubmit} disabled={updateRecipe.isPending}>
          {updateRecipe.isPending ? "Đang lưu..." : "Lưu công thức"}
        </Button>
      </div>
    </div>
  );
}
