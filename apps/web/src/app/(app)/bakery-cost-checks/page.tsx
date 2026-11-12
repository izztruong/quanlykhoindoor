"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useBakeryCostCheckList, useCreateBakeryCostCheck } from "@/hooks/useBakeryCostChecks";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import Link from "next/link";
import { parsePage, parsePageSize, useListUrlState } from "@/hooks/useListUrlState";
import { useMemo, useState } from "react";

const cell = "border border-slate-200 px-3 py-2";
const head = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

/** "dd/MM/yyyy HH:mm" theo giờ VN. */
function fmt(instant: string): string {
  const d = new Date(new Date(instant).getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function BakeryCostChecksPage() {
  const { data: bakeries = [] } = useUserOptions({ scope: "bakery" });
  const { values, update } = useListUrlState({ page: "1", pageSize: "20" });
  const page = parsePage(values.page);
  const pageSize = parsePageSize(values.pageSize);
  const setPage = (p: number) => update({ page: String(p) });
  const { data, isLoading } = useBakeryCostCheckList({ page, pageSize });
  const createCheck = useCreateBakeryCostCheck();

  const [userId, setUserId] = useState("");
  const [openingStockCheckId, setOpeningStockCheckId] = useState("");
  const [closingStockCheckId, setClosingStockCheckId] = useState("");
  const [note, setNote] = useState("");
  // Mặc định TẮT, và CỐ Ý không reset sau khi lập xong (xem `onSuccess`): người lập thường chạy
  // một loạt phiếu cùng chế độ, tự tắt về là âm thầm đổi thước đo giữa loạt.
  const [useVat, setUseVat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: stockChecksResult } = useStockChecks({ createdById: userId || undefined, pageSize: 500 });
  const stockChecks = useMemo(
    () => [...(stockChecksResult?.items ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [stockChecksResult],
  );

  function submit() {
    setError(null);
    if (!userId || !openingStockCheckId || !closingStockCheckId) {
      setError("Chọn tiệm bánh và hai phiếu kiểm kê đầu/cuối kỳ.");
      return;
    }
    if (openingStockCheckId === closingStockCheckId) {
      setError("Phiếu kiểm đầu kỳ và cuối kỳ phải khác nhau.");
      return;
    }
    createCheck.mutate(
      { userId, openingStockCheckId, closingStockCheckId, note: note || undefined, useVat },
      {
        onSuccess: () => {
          setOpeningStockCheckId("");
          setClosingStockCheckId("");
          setNote("");
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lập phiếu thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Check Cost tiệm bánh</h1>
        <p className="text-sm text-slate-500">
          So nguyên liệu <strong>thực dùng</strong> với <strong>định mức theo công thức</strong> của số bánh đã bán ra.
          Định mức và doanh thu lấy từ trang <strong>Bánh bán ra</strong> (thay cho doanh số POS của quán), và công
          thức dùng <strong>bản riêng của tiệm bánh</strong>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lập phiếu mới</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Tiệm bánh</label>
            <Select
              className="w-52"
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setOpeningStockCheckId("");
                setClosingStockCheckId("");
              }}
            >
              <option value="">Chọn tiệm bánh</option>
              {bakeries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Phiếu kiểm đầu kỳ</label>
            <Select
              className="w-64"
              value={openingStockCheckId}
              onChange={(e) => setOpeningStockCheckId(e.target.value)}
              disabled={!userId}
            >
              <option value="">Chọn phiếu</option>
              {stockChecks.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.code} — {fmt(sc.checkedAt)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Phiếu kiểm cuối kỳ</label>
            <Select
              className="w-64"
              value={closingStockCheckId}
              onChange={(e) => setClosingStockCheckId(e.target.value)}
              disabled={!userId}
            >
              <option value="">Chọn phiếu</option>
              {stockChecks.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.code} — {fmt(sc.checkedAt)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Ghi chú</label>
            <Input className="w-56" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
          </div>
          <div className="w-full">
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={useVat}
                onChange={(e) => setUseVat(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <strong>Dùng VAT</strong> — cộng VAT vào giá vốn nguyên liệu và giá xuất bánh theo cột VAT của từng
                hàng hoá và từng bánh (giá khai trong danh mục là giá trước thuế). Hàng chưa khai VAT giữ giá nguyên.
                Chốt cứng vào phiếu, sau khi lưu không đổi được.
              </span>
            </label>
          </div>
          <Button onClick={submit} disabled={createCheck.isPending}>
            {createCheck.isPending ? "Đang lập..." : "Lập phiếu"}
          </Button>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-0 p-0">
          <div className="overflow-x-auto px-4 pt-4">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={head}>Mã phiếu</th>
                  <th className={head}>Tiệm bánh</th>
                  <th className={head}>Kỳ</th>
                  <th className={head}>Trạng thái</th>
                  <th className={head}>Người lập</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className={`${cell} text-slate-400`} colSpan={5}>
                      Đang tải...
                    </td>
                  </tr>
                )}
                {!isLoading && (data?.items ?? []).length === 0 && (
                  <tr>
                    <td className={`${cell} text-slate-400`} colSpan={5}>
                      Chưa có phiếu nào.
                    </td>
                  </tr>
                )}
                {(data?.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className={cell}>
                      <Link href={`/bakery-cost-checks/${item.id}`} className="text-indigo-600 hover:underline">
                        {item.code}
                      </Link>
                    </td>
                    <td className={cell}>{item.user?.name}</td>
                    <td className={cell}>
                      {fmt(item.openingStockCheck.checkedAt)} → {fmt(item.closingStockCheck.checkedAt)}
                    </td>
                    <td className={cell}>
                      {item.status === "CANCELLED" ? <Badge tone="red">Đã huỷ</Badge> : <Badge tone="green">Đang dùng</Badge>}
                    </td>
                    <td className={cell}>{item.createdBy?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => update({ pageSize: String(size), page: "1" })}
          />
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        Số liệu phiếu được chốt cứng lúc lập: sửa công thức hay giá xuất về sau không làm đổi phiếu đã lập.
      </p>
    </div>
  );
}
