"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useDeleteFinishedGoodPrice, useFinishedGoodPrices, useSaveFinishedGoodPrice } from "@/hooks/useFinishedGoodPrices";
import { ApiError } from "@/lib/api-client";
import { formatDateOnly, toDateInput, todayForDateInput } from "@/lib/dateRange";
import { formatCurrency } from "@/lib/format";
import type { AffectedCostCheck } from "@/types";
import Link from "next/link";
import { useState } from "react";

/**
 * Lịch sử giá bán của một đồ thành phẩm/món.
 *
 * Doanh thu Check Cost dùng giá CÓ HIỆU LỰC tại từng ngày bán, nên đổi giá giữa tháng không còn làm
 * lệch doanh thu cả kỳ. Ô "Giá bán" ở form danh mục vẫn là giá hiện hành và được cập nhật tự động khi
 * lưu một mốc không thuộc tương lai — hai nơi luôn khớp nhau.
 */
export function FinishedGoodPriceClient({ id }: { id: string }) {
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const { data: prices = [], isLoading } = useFinishedGoodPrices(id);
  const savePrice = useSaveFinishedGoodPrice(id);
  const deletePrice = useDeleteFinishedGoodPrice(id);

  const finishedGoodItem = finishedGoodItems.find((f) => f.id === id);

  const [effectiveFrom, setEffectiveFrom] = useState(todayForDateInput());
  const [sellingPrice, setSellingPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCostCheck[]>([]);

  const matched = prices.find((p) => toDateInput(p.effectiveFrom) === effectiveFrom);

  function handleSubmit() {
    setError(null);
    setSaved(null);
    setAffected([]);
    if (sellingPrice.trim() === "" || Number(sellingPrice) < 0 || Number.isNaN(Number(sellingPrice))) {
      setError("Giá bán phải là số không âm.");
      return;
    }

    savePrice.mutate(
      { effectiveFrom, sellingPrice: Number(sellingPrice) },
      {
        onSuccess: (result) => {
          setSaved(`Đã lưu giá bán áp dụng từ ${formatDateOnly(effectiveFrom)}.`);
          setSellingPrice("");
          setAffected(result.affectedCostChecks);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu giá bán thất bại"),
      },
    );
  }

  function handleDelete(priceId: string, label: string) {
    if (!confirm(`Xoá mốc giá ${label}? Từ mốc này trở đi, Check Cost sẽ dùng mốc liền trước.`)) return;
    setError(null);
    setSaved(null);
    setAffected([]);
    deletePrice.mutate(priceId, {
      onSuccess: (result) => {
        setSaved(`Đã xoá mốc giá ${label}.`);
        setAffected(result.affectedCostChecks);
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá mốc giá thất bại"),
    });
  }

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/catalog/finished-goods" className="self-start text-sm text-indigo-600 hover:underline">
          ← Đồ thành phẩm
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Giá bán theo thời gian: {finishedGoodItem?.name ?? "..."}</h1>
        <p className="text-sm text-slate-500">
          Doanh thu trong phiếu Check Cost được tính theo giá có hiệu lực tại <strong>từng ngày bán</strong>, nên đổi giá giữa
          tháng không làm lệch doanh thu của cả kỳ. Mốc tính theo ngày: đổi giá lúc nào trong ngày cũng áp dụng từ đầu ngày đó.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thêm mốc giá</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Có hiệu lực từ</label>
            <Input type="date" className="w-44" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Giá bán</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              className="w-40"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button onClick={handleSubmit} disabled={savePrice.isPending}>
            {savePrice.isPending ? "Đang lưu..." : matched ? "Sửa mốc này" : "Thêm mốc"}
          </Button>
          {matched && (
            <p className="text-sm text-slate-600">
              Đã có mốc {formatDateOnly(effectiveFrom)} giá {formatCurrency(matched.sellingPrice)} — lưu sẽ ghi đè.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Các mốc giá</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {prices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Chưa có mốc giá nào</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left">Có hiệu lực từ</th>
                  <th className="border border-slate-200 px-3 py-2 text-right">Giá bán</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">Người tạo</th>
                  <th className="border border-slate-200 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {prices.map((price, index) => (
                  <tr key={price.id}>
                    <td className="border border-slate-200 px-3 py-2">
                      {formatDateOnly(price.effectiveFrom)}
                      {index === 0 && <span className="ml-2 text-xs text-emerald-600">đang áp dụng</span>}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-right">{formatCurrency(price.sellingPrice)}</td>
                    <td className="border border-slate-200 px-3 py-2 text-slate-500">{price.createdBy?.name ?? "—"}</td>
                    <td className="border border-slate-200 px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletePrice.isPending}
                        onClick={() => handleDelete(price.id, formatDateOnly(price.effectiveFrom))}
                      >
                        Xoá mốc
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">{saved}</p>}
      {affected.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Các phiếu Check Cost sau có kỳ chứa mốc này nên doanh thu của chúng <strong>không còn khớp giá mới</strong> — phiếu
          đã chốt số nên không tự cập nhật, cần huỷ và tạo lại nếu muốn: {affected.map((c) => c.code).join(", ")}
        </div>
      )}
    </div>
  );
}
