"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import {
  useDeleteFinishedGoodRecipeVersion,
  useFinishedGoodRecipe,
  useFinishedGoodRecipeVersions,
  useUpdateFinishedGoodRecipe,
} from "@/hooks/useFinishedGoodRecipes";
import { ApiError } from "@/lib/api-client";
import { formatDateOnly, toDateInput, todayForDateInput } from "@/lib/dateRange";
import { formatNumber } from "@/lib/format";
import type { AffectedCostCheck, Product } from "@/types";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

interface RecipeRow {
  productId: string;
  product: Product;
  quantityPerUnit: string;
}

export function FinishedGoodRecipeClient({ id }: { id: string }) {
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const { data: products = [] } = useProducts();
  const { data: recipeItems, isLoading } = useFinishedGoodRecipe(id);
  const { data: versions = [] } = useFinishedGoodRecipeVersions(id);
  const updateRecipe = useUpdateFinishedGoodRecipe(id);
  const deleteVersion = useDeleteFinishedGoodRecipeVersion(id);

  const finishedGoodItem = finishedGoodItems.find((f) => f.id === id);

  const serverRows = useMemo<RecipeRow[]>(
    () =>
      (recipeItems ?? []).map((it) => ({
        productId: it.productId,
        product: it.product,
        quantityPerUnit: String(it.quantityPerUnit),
      })),
    [recipeItems],
  );

  // null = chưa ai động vào, hiển thị thẳng dữ liệu server. Trước đây là một bản sao được effect
  // đổ vào kèm cờ `initialized` — bảng hiện rỗng một lượt render rồi mới có dòng.
  const [edited, setEdited] = useState<RecipeRow[] | null>(null);
  const rows = edited ?? serverRows;
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCostCheck[]>([]);

  /**
   * Ngày công thức này bắt đầu áp dụng. Mặc định HÔM NAY — luồng thường gặp là "quán vừa đổi công
   * thức", và bảng bên dưới đã điền sẵn công thức hiện hành để sửa từ đó. Khai muộn được bằng cách
   * chọn ngày trong quá khứ.
   */
  const [effectiveFrom, setEffectiveFrom] = useState(todayForDateInput());
  const isFirstVersion = versions.length === 0;
  const matchedVersion = versions.find((v) => toDateInput(v.effectiveFrom) === effectiveFrom);

  /** Lần sửa đầu tiên tách bản nháp ra khỏi dữ liệu server; các lần sau sửa tiếp trên bản nháp. */
  function patchRows(fn: (prev: RecipeRow[]) => RecipeRow[]) {
    setEdited((prev) => fn(prev ?? serverRows));
  }

  const rowIds = useMemo(() => new Set(rows.map((r) => r.productId)), [rows]);
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return products.filter((p) => !rowIds.has(p.id) && (p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))).slice(0, 8);
  }, [search, products, rowIds]);

  function addRow(product: Product) {
    patchRows((prev) => (prev.some((r) => r.productId === product.id) ? prev : [...prev, { productId: product.id, product, quantityPerUnit: "" }]));
    setSearch("");
  }

  function updateRow(productId: string, quantityPerUnit: string) {
    patchRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, quantityPerUnit } : r)));
  }

  function removeRow(productId: string) {
    patchRows((prev) => prev.filter((r) => r.productId !== productId));
  }

  /** Nạp một mốc cũ vào bảng để xem/sửa — đồng thời đổi ô ngày sang mốc đó. */
  function loadVersion(versionId: string) {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;
    setEffectiveFrom(toDateInput(version.effectiveFrom));
    setEdited(
      version.items.map((it) => ({ productId: it.productId, product: it.product, quantityPerUnit: String(it.quantityPerUnit) })),
    );
    setError(null);
    setSaved(null);
    setAffected([]);
  }

  function handleSubmit() {
    setError(null);
    setSaved(null);
    setAffected([]);
    const items = rows
      .filter((r) => r.quantityPerUnit.trim() !== "" && Number(r.quantityPerUnit) > 0)
      .map((r) => ({ productId: r.productId, quantityPerUnit: Number(r.quantityPerUnit) }));

    updateRecipe.mutate(
      {
        items,
        // Công thức ĐẦU TIÊN của món thì không gửi ngày: server tự đặt mốc gốc để nó áp cho cả quá khứ
        // (gửi hôm nay sẽ làm phiếu Check Cost kỳ trước ra định mức 0).
        effectiveFrom: isFirstVersion ? undefined : effectiveFrom,
        overwrite: Boolean(matchedVersion),
      },
      {
        onSuccess: (result) => {
          setEdited(null);
          setSaved(
            isFirstVersion
              ? "Đã lưu công thức, áp dụng cho cả dữ liệu trước đây."
              : `Đã lưu công thức áp dụng từ ${formatDateOnly(effectiveFrom)}.`,
          );
          setAffected(result.affectedCostChecks);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu công thức thất bại"),
      },
    );
  }

  function handleDeleteVersion(versionId: string, label: string) {
    if (!confirm(`Xoá mốc công thức ${label}? Từ mốc này trở đi, Check Cost sẽ dùng mốc liền trước.`)) return;
    setError(null);
    setSaved(null);
    setAffected([]);
    deleteVersion.mutate(versionId, {
      onSuccess: (result) => {
        setEdited(null);
        setSaved(`Đã xoá mốc ${label}.`);
        setAffected(result.affectedCostChecks);
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá mốc thất bại"),
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
        <p className="mt-1 text-sm text-slate-500">
          Công thức được lưu theo <strong>mốc hiệu lực</strong>: đổi công thức giữa tháng thì Check Cost tự tính phần trước
          mốc bằng định lượng cũ và phần sau bằng định lượng mới, không cần tách phiếu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mốc hiệu lực</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {isFirstVersion ? (
            <p className="text-sm text-slate-600">
              Đây là công thức đầu tiên của món này nên sẽ <strong>áp dụng cho cả dữ liệu trước đây</strong>. Lần sửa sau mới
              cần chọn ngày hiệu lực.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Có hiệu lực từ</label>
                  <Input type="date" className="w-44" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
                </div>
                <p className="text-sm text-slate-600">
                  {matchedVersion ? (
                    <>
                      Đang <strong>sửa mốc {formatDateOnly(effectiveFrom)}</strong> — lưu sẽ ghi đè công thức của mốc này.
                    </>
                  ) : (
                    <>
                      Sẽ <strong>tạo mốc mới từ {formatDateOnly(effectiveFrom)}</strong>.
                    </>
                  )}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Mốc tính theo ngày, nên đổi công thức lúc nào trong ngày cũng áp dụng từ đầu ngày đó.
              </p>
            </>
          )}
        </CardBody>
      </Card>

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

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Các mốc đã có</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-3 py-2">Có hiệu lực từ</th>
                  <th className="border border-slate-200 px-3 py-2">Số nguyên liệu</th>
                  <th className="border border-slate-200 px-3 py-2">Người tạo</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {versions.map((version, index) => (
                  <tr key={version.id}>
                    <td className="border border-slate-200 px-3 py-2">
                      {formatDateOnly(version.effectiveFrom)}
                      {index === 0 && <span className="ml-2 text-xs text-emerald-600">đang áp dụng</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">{formatNumber(version.items.length)}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-500">{version.createdBy?.name ?? "—"}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => loadVersion(version.id)}>
                          Xem / sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleteVersion.isPending}
                          onClick={() => handleDeleteVersion(version.id, formatDateOnly(version.effectiveFrom))}
                        >
                          Xoá mốc
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">{saved}</p>}
      {affected.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Các phiếu Check Cost sau có kỳ chứa mốc này nên số liệu của chúng <strong>không còn khớp công thức mới</strong> —
          phiếu đã chốt số nên không tự cập nhật, cần huỷ và tạo lại nếu muốn: {affected.map((c) => c.code).join(", ")}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={updateRecipe.isPending}>
          {updateRecipe.isPending ? "Đang lưu..." : matchedVersion ? "Lưu mốc này" : "Lưu công thức"}
        </Button>
      </div>
    </div>
  );
}
