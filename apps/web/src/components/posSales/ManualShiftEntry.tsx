"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useSaveShiftSales, useShiftDefinitions, useShiftSales } from "@/hooks/usePosSales";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { POS_SALE_SOURCE_LABELS, type ShiftCode } from "@/types";
import { Info, Save, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

/** Ngày hôm nay theo giờ VN. Không dùng toISOString() thẳng: máy đặt sai múi giờ sẽ lệch ngày. */
function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function hh(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Nhập doanh số bằng tay theo CA.
 *
 * Vì sao cần bên cạnh nhập Excel: quán nhập mỗi khi hết ca — 3 ca × 3 quán = 9 lượt mỗi ngày. Xuất file
 * POS 9 lần một ngày là gánh nặng thật.
 *
 * Số gõ ở đây là TỔNG CỦA CẢ CA. Hệ thống đặt nó vào ô giữa ca và đánh dấu nguồn là "gõ tay", nên phép
 * cắt ca vẫn ra đúng tổng — nhưng chi tiết theo giờ thì không có, và màn nói thẳng điều đó.
 */
export function ManualShiftEntry({ userId }: { userId?: string }) {
  const { data: shifts = [] } = useShiftDefinitions();
  const { data: allItems = [] } = useFinishedGoodItems();
  const save = useSaveShiftSales();

  const [businessDate, setBusinessDate] = useState(todayVn);
  const [shift, setShift] = useState<ShiftCode>("CA1");
  const [search, setSearch] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { data: snapshot } = useShiftSales({ userId, businessDate, shift }, Boolean(businessDate));

  // Chỉ món BÁN QUA POS. Đồ thành phẩm (THANH_PHAM) là đồ pha sẵn đếm ở phiếu kiểm kê — server cũng chặn,
  // đây chỉ là lớp hiển thị. Dữ liệu thật đã có 12 dòng Check Cost ghi nhầm vì hai tên chỉ khác chữ hoa.
  const sellableItems = useMemo(() => {
    const sellable = allItems.filter((it) => it.category !== "THANH_PHAM");
    const q = search.trim().toLowerCase();
    return q ? sellable.filter((it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)) : sellable;
  }, [allItems, search]);

  const savedByItem = useMemo(
    () => new Map((snapshot?.items ?? []).map((it) => [it.finishedGoodItemId, it.quantity])),
    [snapshot],
  );

  /** Khoá theo (ngày|ca|món) để đổi ngày hoặc ca là tự hết ô đã sửa, khỏi cần effect dọn. */
  const key = (itemId: string) => `${businessDate}|${shift}|${itemId}`;

  function valueOf(itemId: string): string {
    const edited = edits[key(itemId)];
    if (edited !== undefined) return edited;
    const existing = savedByItem.get(itemId);
    return existing == null ? "" : String(existing);
  }

  function setValue(itemId: string, value: string) {
    setSaved(null);
    setEdits((prev) => ({ ...prev, [key(itemId)]: value }));
  }

  const shiftDef = shifts.find((s) => s.code === shift);
  const hasExcel = snapshot?.sources.includes("EXCEL") ?? false;
  const totalEntered = sellableItems.reduce((sum, it) => {
    const v = Number(valueOf(it.id));
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);

  function onSave() {
    // Gửi MỌI món đang hiện, kể cả ô trống (thành 0) — đó là cách người dùng gỡ một món khỏi ca mà không
    // phải nhớ nó từng có mặt. Server ghi đè trọn ca nên 0 nghĩa là xoá.
    const items = sellableItems.map((it) => {
      const raw = valueOf(it.id).trim();
      const n = Number(raw);
      return { finishedGoodItemId: it.id, quantity: raw === "" || !Number.isFinite(n) || n < 0 ? 0 : n };
    });
    if (items.every((it) => it.quantity === 0)) {
      setError("Chưa nhập số lượng nào — nhập ít nhất một món");
      return;
    }
    setError(null);
    setSaved(null);
    save.mutate(
      { userId, businessDate, shift, items },
      {
        onSuccess: (r) => {
          setEdits({});
          setSaved(
            `Đã ghi ${r.written} món cho ${shiftDef?.name ?? shift} ngày ${businessDate}` +
              (r.hadExcelData ? " — đã thay dữ liệu nhập từ file Excel của ca này." : "."),
          );
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không ghi được doanh số ca"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <span>Nhập tay theo ca</span>
            {snapshot?.sources.map((s) => (
              <Badge key={s} tone={s === "EXCEL" ? "blue" : "green"}>
                {POS_SALE_SOURCE_LABELS[s]}
              </Badge>
            ))}
            {snapshot && snapshot.sources.length === 0 && <Badge tone="gray">ca này chưa có số</Badge>}
          </div>
        </CardTitle>
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            Số gõ ở đây là <strong>tổng của cả ca</strong>. Hệ thống lưu ở mức giờ (để sau này đổi mốc chia ca không
            phải nhập lại) nên nó đặt số vào <strong>giờ giữa ca</strong> và đánh dấu là &ldquo;gõ tay&rdquo; —
            tổng theo ca vẫn đúng, còn chi tiết từng giờ thì không có. Nhập lại cùng một ca là <strong>sửa</strong>,
            không cộng dồn.
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Ngày kinh doanh</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Ca</label>
            <Select value={shift} onChange={(e) => setShift(e.target.value as ShiftCode)} className="w-48">
              {shifts.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({hh(s.startHour)}:{hh(s.startMinute)}–{hh(s.endHour)}:{hh(s.endMinute)})
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Tìm món</label>
            <Input placeholder="Tên hoặc mã món..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </div>
          <Button type="button" onClick={onSave} disabled={save.isPending || shifts.length === 0}>
            <Save size={16} />
            {save.isPending ? "Đang ghi..." : "Ghi doanh số ca"}
          </Button>
        </div>

        {hasExcel && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Ca này <strong>đã có dữ liệu nhập từ file Excel</strong> (có giờ thật của từng đơn). Ghi tay sẽ thay
              toàn bộ ca đó và <strong>mất chi tiết theo giờ</strong>. Nếu chỉ muốn sửa một món thì nên sửa trong file
              rồi nhập lại.
            </div>
          </div>
        )}

        {shifts.length === 0 ? (
          <p className="text-sm text-red-600">
            Chưa khai khung giờ ca — vào <strong>Quản trị › Khung giờ ca</strong> để thiết lập trước.
          </p>
        ) : (
          <>
            {snapshot && snapshot.hours.length > 0 && (
              <p className="text-xs text-slate-400">
                {shiftDef?.name} phủ các giờ {snapshot.hours.map(hh).join(", ")} · số gõ tay sẽ nằm ở giờ{" "}
                {hh(snapshot.hours[Math.floor((snapshot.hours.length - 1) / 2)]!)}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Mã</th>
                    <th className={headClass}>Món</th>
                    <th className={headClass}>Đã bán trong ca</th>
                  </tr>
                </thead>
                <tbody>
                  {sellableItems.length === 0 ? (
                    <tr>
                      <td className={cellClass} colSpan={3}>
                        <span className="text-slate-500">
                          {allItems.length === 0
                            ? "Danh mục Đồ thành phẩm còn trống — khai món trước."
                            : "Không có món nào khớp từ khoá tìm."}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    sellableItems.map((item) => (
                      <tr key={item.id}>
                        <td className={cellClass}>{item.code}</td>
                        <td className={cellClass}>{item.name}</td>
                        <td className={cellClass}>
                          <Input
                            type="number"
                            step="1"
                            min="0"
                            className="w-24"
                            value={valueOf(item.id)}
                            onChange={(e) => setValue(item.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-400">
              Tổng đang nhập: <strong>{formatNumber(totalEntered)}</strong> · ô để trống được tính là 0, tức gỡ món đó
              khỏi ca.
            </p>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">{saved}</p>}
      </CardBody>
    </Card>
  );
}
