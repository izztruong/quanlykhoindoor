"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCostCheckPosPreview, useCreateCostCheck } from "@/hooks/useCostChecks";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { formatDateOnly } from "@/lib/dateRange";
import { formatDateTime, formatNumber } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * SL đồ thành phẩm/món đã bán KHÔNG còn gõ tay: server lấy từ doanh số POS theo đúng kỳ của phiếu
 * (từng ô giờ), nên con số dùng để tính định mức và doanh thu là cùng một nguồn với màn Doanh số POS.
 * Người lập phiếu chỉ còn khai khuyến mãi.
 *
 * Panel "Doanh số POS trong kỳ" gọi `/cost-checks/pos-preview` ngay khi chọn đủ hai phiếu kiểm kê, để
 * thấy trước số sẽ dùng — kỳ không có dữ liệu POS thì server từ chối tạo phiếu, thấy sớm đỡ điền xong
 * mới bị chặn.
 */
export default function NewCostCheckPage() {
  const router = useRouter();
  const { data: users = [] } = useUserOptions();
  const createCostCheck = useCreateCostCheck();

  const [userId, setUserId] = useState("");
  const { data: stockChecksResult } = useStockChecks({ createdById: userId || undefined, pageSize: 500 });
  // `?? []` nằm TRONG useMemo: để ngoài thì mỗi lần render lại sinh một mảng rỗng mới, dependency
  // đổi liên tục và useMemo không giữ được gì.
  const sortedStockChecks = useMemo(
    () => [...(stockChecksResult?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [stockChecksResult],
  );

  const [openingStockCheckId, setOpeningStockCheckId] = useState("");
  const [closingStockCheckId, setClosingStockCheckId] = useState("");
  const [note, setNote] = useState("");
  const [discountTra, setDiscountTra] = useState("");
  const [discountDav, setDiscountDav] = useState("");
  const [error, setError] = useState<string | null>(null);

  const periodReady = Boolean(userId && openingStockCheckId && closingStockCheckId && openingStockCheckId !== closingStockCheckId);
  const preview = useCostCheckPosPreview({
    userId: periodReady ? userId : "",
    openingStockCheckId: periodReady ? openingStockCheckId : "",
    closingStockCheckId: periodReady ? closingStockCheckId : "",
  });

  function handleUserChange(nextUserId: string) {
    setUserId(nextUserId);
    setOpeningStockCheckId("");
    setClosingStockCheckId("");
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

    createCostCheck.mutate(
      {
        userId,
        openingStockCheckId,
        closingStockCheckId,
        note: note || undefined,
        discountTra: discountTra === "" ? undefined : Number(discountTra),
        discountDav: discountDav === "" ? undefined : Number(discountDav),
      },
      {
        onSuccess: (created) => router.push(`/cost-checks/${created.id}`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu Check Cost thất bại"),
      },
    );
  }

  const coverage = preview.data?.coverage;
  const previewError = preview.error instanceof ApiError ? preview.error.message : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/cost-checks" className="self-start text-sm text-indigo-600 hover:underline">
          ← Danh sách Check Cost
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">Tạo phiếu Check Cost</h1>
        <p className="text-sm text-slate-500">
          Chọn quán và 2 phiếu kiểm kê quán (đầu kỳ/cuối kỳ) đã có. SL món đã bán được lấy tự động từ{" "}
          <Link href="/admin/pos-sales" className="text-indigo-600 hover:underline">
            doanh số POS
          </Link>{" "}
          của kỳ đó, chỉ còn khuyến mãi là nhập tay.
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
          <CardTitle>Doanh số POS trong kỳ</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {!periodReady ? (
            <p className="text-sm text-slate-400">Chọn quán và 2 phiếu kiểm kê khác nhau để xem doanh số sẽ dùng.</p>
          ) : preview.isLoading ? (
            <p className="text-sm text-slate-400">Đang tải doanh số...</p>
          ) : previewError ? (
            <p className="text-sm text-red-600">{previewError}</p>
          ) : !preview.data || preview.data.cellCount === 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Kỳ này <strong>chưa có dữ liệu doanh số POS nào</strong> nên không tạo được phiếu. Vào{" "}
              <Link href="/admin/pos-sales" className="underline">
                Quản trị › Doanh số POS
              </Link>{" "}
              để nhập, rồi quay lại. Nếu đã nhập mà vẫn báo thiếu thì kiểm tra{" "}
              <Link href="/admin/pos-item-mapping" className="underline">
                Ánh xạ món POS
              </Link>{" "}
              — còn một tên chưa ánh xạ thì cả file không ghi dòng nào.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs uppercase text-slate-500">Tổng SL đã bán</p>
                  <p className="text-lg font-semibold text-slate-800">{formatNumber(preview.data.totalQuantity)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Số món</p>
                  <p className="text-lg font-semibold text-slate-800">{formatNumber(preview.data.items.length)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500">Ngày có dữ liệu</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {coverage?.daysWithData}/{coverage?.expectedDays}
                  </p>
                </div>
              </div>

              {coverage && coverage.missingDays.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Kỳ này thiếu dữ liệu POS {coverage.missingDays.length}/{coverage.expectedDays} ngày:{" "}
                  {coverage.missingDays.map(formatDateOnly).join(", ")}. Nếu quán <strong>có bán</strong> những ngày đó thì
                  cột &quot;Theo công thức&quot; và doanh thu của phiếu sẽ bị thiếu — nên nhập bù trước khi tạo phiếu.
                </div>
              )}

              {coverage && coverage.skippedPreparedItems.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Đã bỏ qua {coverage.skippedPreparedItems.length} món đồ pha sẵn có trong doanh số POS:{" "}
                  {coverage.skippedPreparedItems.join(", ")}. Đồ pha sẵn được đếm ở phiếu kiểm kê quán, tính thêm vào đây là
                  tính hai lần — nên sửa lại ánh xạ món POS.
                </div>
              )}

              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Món</th>
                      <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left">Đơn vị</th>
                      <th className="sticky top-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-right">SL đã bán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.items.map((row, index) => (
                      <tr key={row.finishedGoodItem?.id ?? index}>
                        <td className="border border-slate-200 px-3 py-2">{row.finishedGoodItem?.name ?? "—"}</td>
                        <td className="border border-slate-200 px-3 py-2 text-slate-500">
                          {row.finishedGoodItem?.unit?.name ?? "—"}
                        </td>
                        <td className="border border-slate-200 px-3 py-2 text-right">{formatNumber(row.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={createCostCheck.isPending || !preview.data || preview.data.cellCount === 0}>
          {createCostCheck.isPending ? "Đang lưu..." : "Lưu phiếu Check Cost"}
        </Button>
      </div>
    </div>
  );
}
