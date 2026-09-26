"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useShiftDefinitions } from "@/hooks/usePosSales";
import {
  useCommitShiftPrep,
  usePreviewShiftPrep,
  useSaveShiftStockCount,
  useShiftStockCount,
  useShiftVariance,
} from "@/hooks/useShiftPrep";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import {
  FORECAST_SOURCE_LABELS,
  ON_HAND_SOURCE_LABELS,
  PREP_MODE_LABELS,
  type ShiftCode,
  type ShiftPrepPreview,
} from "@/types";
import { ChefHat, ClipboardList, Info, RefreshCw } from "lucide-react";
import { Fragment, useCallback, useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-2 py-2 align-top";
const headClass = "border border-slate-200 px-2 py-2 text-left text-xs font-medium uppercase text-slate-500";

/** Ngày kinh doanh hôm nay theo giờ VN. Không dùng toISOString() thẳng: máy đặt sai múi giờ sẽ lệch ngày. */
function todayBusinessDate(): string {
  const vn = new Date(Date.now() + 7 * 3_600_000);
  return vn.toISOString().slice(0, 10);
}

/** Giờ phút của một mốc ISO, theo giờ VN. */
function vnTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Nguồn tồn nào đáng tin tới mức nào — số ước tính phải nhìn ra ngay là ước tính. */
function onHandTone(source: string): "gray" | "green" | "yellow" | "red" | "blue" {
  if (source === "PREV_SHIFT_COUNT") return "green";
  if (source === "MANUAL") return "blue";
  if (source === "ESTIMATED") return "yellow";
  return "red";
}

export function ShiftPrepClient() {
  const { data: shifts = [] } = useShiftDefinitions();
  const preview = usePreviewShiftPrep();
  const commit = useCommitShiftPrep();
  const saveCount = useSaveShiftStockCount();

  const [businessDate, setBusinessDate] = useState(todayBusinessDate);
  // Người dùng chọn tay thì giữ lựa chọn đó; chưa chọn thì suy từ giờ hiện tại. Cố ý KHÔNG đồng bộ vào
  // state trong useEffect: làm thế sẽ đè lựa chọn của người dùng mỗi lần danh sách ca tải lại.
  const [shiftOverride, setShiftOverride] = useState<ShiftCode | null>(null);
  const [result, setResult] = useState<ShiftPrepPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Ba bảng ô nhập, khoá theo finishedGoodItemId. Chỉ món nào người dùng sửa mới có mặt.
  const [onHandInputs, setOnHandInputs] = useState<Record<string, string>>({});
  const [batchInputs, setBatchInputs] = useState<Record<string, string>>({});
  // Khoá theo (ngày|ca|món) để đổi ca là tự hết ô đã sửa, khỏi cần effect dọn.
  const [countOverrides, setCountOverrides] = useState<Record<string, string>>({});

  // Ca đang diễn ra theo giờ VN, để nhân viên mở màn là đúng ca của mình.
  // Giờ mở màn, chốt MỘT LẦN lúc mount: đọc đồng hồ giữa lúc render là hàm không thuần, kết quả đổi
  // mỗi lần component render lại.
  const [openedAtVn] = useState(() => Date.now() + 7 * 3_600_000);
  const currentShift = useMemo<ShiftCode | null>(() => {
    if (shifts.length === 0) return null;
    const vn = new Date(openedAtVn);
    const minutes = vn.getUTCHours() * 60 + vn.getUTCMinutes();
    const current = shifts.find((s) => {
      const start = s.startHour * 60 + s.startMinute;
      const end = s.endHour * 60 + s.endMinute;
      return end <= start ? minutes >= start || minutes < end : minutes >= start && minutes < end;
    });
    return current?.code ?? null;
  }, [shifts, openedAtVn]);
  const shift = shiftOverride ?? currentShift ?? "CA1";

  const { data: existingCount } = useShiftStockCount({ businessDate, shift }, Boolean(businessDate));
  const { data: variance = [] } = useShiftVariance({ businessDate, shift }, Boolean(businessDate));

  /**
   * Số đếm hiện trên ô: ô người dùng đã sửa thắng, chưa sửa thì lấy từ phiếu đếm đã lưu.
   *
   * Cố ý KHÔNG nhân bản dữ liệu server vào state qua useEffect — làm thế thì mỗi lần query trả về lại là
   * một lượt ghi state, và số người dùng đang gõ có thể bị đè giữa lúc gõ.
   */
  const countKey = (itemId: string) => `${businessDate}|${shift}|${itemId}`;
  function countValueOf(itemId: string): string {
    const edited = countOverrides[countKey(itemId)];
    if (edited !== undefined) return edited;
    const saved = existingCount?.items.find((i) => i.finishedGoodItemId === itemId);
    return saved ? String(Number(saved.quantity)) : "";
  }
  function setCountValue(itemId: string, value: string) {
    setCountOverrides((prev) => ({ ...prev, [countKey(itemId)]: value }));
  }

  const onHandPayload = useCallback(() => {
    const entries = Object.entries(onHandInputs).filter(([, v]) => v.trim() !== "" && Number.isFinite(Number(v)));
    return entries.map(([finishedGoodItemId, v]) => ({ finishedGoodItemId, quantity: Number(v) }));
  }, [onHandInputs]);

  const runPreview = useCallback(() => {
    setError(null);
    setSaved(null);
    preview.mutate(
      { businessDate, shift, onHandFinished: onHandPayload() },
      {
        onSuccess: (data) => {
          setResult(data);
          // Lấy sẵn số mẻ đề xuất vào ô "số mẻ thật" — người pha chỉ sửa khi khác.
          setBatchInputs(Object.fromEntries(data.items.map((it) => [it.finishedGoodItemId, String(it.suggestedBatches)])));
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không tính được đề xuất chuẩn bị ca"),
      },
    );
  }, [businessDate, shift, onHandPayload, preview]);

  const items = result?.items ?? [];
  const toPrepare = items.filter((it) => it.suggestedBatches > 0 || it.suggestedQty > 0);
  const estimatedCount = items.filter((it) => it.onHandSource === "ESTIMATED").length;

  const totalCounted = items.filter((it) => countValueOf(it.finishedGoodItemId).trim() !== "").length;

  function onCommit() {
    if (items.length === 0) return;
    setError(null);
    commit.mutate(
      {
        businessDate,
        shift,
        onHandFinished: onHandPayload(),
        items: items.map((it) => ({
          finishedGoodItemId: it.finishedGoodItemId,
          actualBatches: Math.max(0, Math.round(Number(batchInputs[it.finishedGoodItemId] ?? 0)) || 0),
        })),
      },
      {
        onSuccess: () => setSaved("Đã ghi số mẻ đã pha cho ca này."),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không ghi được số mẻ"),
      },
    );
  }

  function onSaveCount() {
    const payload = items
      .map((it) => ({ finishedGoodItemId: it.finishedGoodItemId, raw: countValueOf(it.finishedGoodItemId).trim() }))
      .filter((it) => it.raw !== "" && Number.isFinite(Number(it.raw)))
      .map((it) => ({ finishedGoodItemId: it.finishedGoodItemId, quantity: Number(it.raw) }));
    if (payload.length === 0) {
      setError("Phải đếm ít nhất một món");
      return;
    }
    setError(null);
    saveCount.mutate(
      { businessDate, shift, items: payload },
      {
        onSuccess: () => {
          setSaved("Đã lưu số đếm cuối ca.");
          // Bỏ ô đã sửa để bảng quay về đúng số vừa lưu từ server, tránh hai nguồn sự thật.
          setCountOverrides({});
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không lưu được số đếm"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Chuẩn bị đồ theo ca</h1>
        <p className="text-sm text-slate-500">
          Đầu ca: xem cần pha mấy mẻ rồi chốt số mẻ thật. Cuối ca: đếm lại những gì còn — <strong>số đếm cuối ca này
          chính là tồn đầu ca sau</strong>, nên một lần đếm dùng cho hai việc và là chỗ duy nhất đo được lượng đổ đi.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
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
            <Select value={shift} onChange={(e) => setShiftOverride(e.target.value as ShiftCode)} className="w-40">
              {shifts.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({String(s.startHour).padStart(2, "0")}:{String(s.startMinute).padStart(2, "0")}–
                  {String(s.endHour).padStart(2, "0")}:{String(s.endMinute).padStart(2, "0")})
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" onClick={runPreview} disabled={preview.isPending}>
            <RefreshCw size={16} />
            {preview.isPending ? "Đang tính..." : "Tính đề xuất"}
          </Button>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">{saved}</p>}

      {result && (
        <>
          {!result.previousShiftCounted && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Ca trước không có phiếu đếm.</strong> Tồn đầu ca của {estimatedCount} món đang là số{" "}
                <strong>ước tính</strong> (đếm gần nhất + đã pha − đã bán). Gõ số thật vào cột &ldquo;Tồn đầu ca&rdquo;
                rồi bấm Tính lại nếu lệch.
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <ChefHat className="h-4 w-4 text-slate-400" />
                  <span>
                    Đầu ca — {result.shiftName} ({vnTime(result.shiftStart)}–{vnTime(result.shiftEnd)})
                  </span>
                  {toPrepare.length > 0 ? (
                    <Badge tone="yellow">{toPrepare.length} món cần pha</Badge>
                  ) : (
                    <Badge tone="green">không cần pha gì</Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Chưa có món nào được đánh dấu &ldquo;phải pha trước&rdquo;. Tick ô đó ở Danh mục › Đồ thành phẩm.
                </p>
              ) : (
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={`${headClass} w-6`} />
                      <th className={headClass}>Món</th>
                      <th className={headClass}>Chế độ</th>
                      <th className={headClass}>Tồn đầu ca</th>
                      <th className={headClass}>Cần dùng</th>
                      <th className={headClass}>Đề xuất</th>
                      <th className={headClass}>Số mẻ thật</th>
                      <th className={headClass}>Dùng được tới</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <Fragment key={it.finishedGoodItemId}>
                        <tr className={it.suggestedBatches > 0 ? "bg-amber-50" : undefined}>
                          <td className={cellClass}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((prev) => ({ ...prev, [it.finishedGoodItemId]: !prev[it.finishedGoodItemId] }))
                              }
                              className="text-slate-400 hover:text-slate-600"
                              aria-label="Xem lý do"
                            >
                              <Info size={14} />
                            </button>
                          </td>
                          <td className={cellClass}>
                            <div className="font-medium text-slate-800">{it.name}</div>
                            <div className="text-xs text-slate-400">
                              {it.code} · {it.unitLabel}
                              {it.batchSize != null && ` · 1 mẻ = ${formatNumber(it.batchSize)}`}
                            </div>
                          </td>
                          <td className={cellClass}>
                            <span className="text-xs">{PREP_MODE_LABELS[it.mode]}</span>
                            {it.forecastSource && (
                              <div className="text-xs text-slate-400">{FORECAST_SOURCE_LABELS[it.forecastSource]}</div>
                            )}
                          </td>
                          <td className={cellClass}>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="w-20"
                              placeholder={String(it.onHandQty)}
                              value={onHandInputs[it.finishedGoodItemId] ?? ""}
                              onChange={(e) =>
                                setOnHandInputs((prev) => ({ ...prev, [it.finishedGoodItemId]: e.target.value }))
                              }
                            />
                            <div className="mt-1">
                              <Badge tone={onHandTone(it.onHandSource)}>{ON_HAND_SOURCE_LABELS[it.onHandSource]}</Badge>
                            </div>
                          </td>
                          <td className={cellClass}>{formatNumber(it.demandQty)}</td>
                          <td className={`${cellClass} font-semibold`}>
                            {it.batchSize != null && it.batchSize > 0
                              ? `${it.suggestedBatches} mẻ`
                              : formatNumber(it.suggestedQty)}
                          </td>
                          <td className={cellClass}>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              className="w-16"
                              value={batchInputs[it.finishedGoodItemId] ?? ""}
                              onChange={(e) =>
                                setBatchInputs((prev) => ({ ...prev, [it.finishedGoodItemId]: e.target.value }))
                              }
                            />
                          </td>
                          <td className={cellClass}>
                            {it.expiresAt ? (
                              <>
                                <div>{vnTime(it.expiresAt)}</div>
                                <div className="text-xs text-slate-400">phủ {it.coversShifts.join(", ")}</div>
                              </>
                            ) : (
                              <span className="text-xs text-amber-700">chưa khai hạn dùng</span>
                            )}
                          </td>
                        </tr>
                        {expanded[it.finishedGoodItemId] && (
                          <tr>
                            <td className={cellClass} />
                            <td className={cellClass} colSpan={7}>
                              <ul className="list-inside list-disc text-xs text-slate-600">
                                {it.reasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
            {items.length > 0 && (
              <CardBody className="flex flex-wrap items-center gap-3 border-t border-slate-100">
                <Button type="button" onClick={onCommit} disabled={commit.isPending}>
                  {commit.isPending ? "Đang ghi..." : "Chốt số mẻ đã pha"}
                </Button>
                <span className="text-xs text-slate-400">
                  Chốt lại cùng một ca là <strong>sửa</strong>, không cộng thêm lượt. Số đề xuất của hệ thống vẫn được
                  lưu riêng để sau này đo xem nó lệch bao nhiêu.
                </span>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  <span>Cuối ca — đếm những gì còn lại</span>
                  {existingCount ? (
                    <Badge tone="green">đã đếm {vnTime(existingCount.countedAt)}</Badge>
                  ) : (
                    <Badge tone="yellow">chưa đếm</Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Món</th>
                    <th className={headClass}>Còn lại</th>
                    <th className={headClass}>Hao hụt ca này</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const v = variance.find((r) => r.finishedGoodItemId === it.finishedGoodItemId);
                    return (
                      <tr key={it.finishedGoodItemId}>
                        <td className={cellClass}>
                          <div className="font-medium text-slate-800">{it.name}</div>
                          <div className="text-xs text-slate-400">{it.unitLabel}</div>
                        </td>
                        <td className={cellClass}>
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            className="w-20"
                            value={countValueOf(it.finishedGoodItemId)}
                            onChange={(e) => setCountValue(it.finishedGoodItemId, e.target.value)}
                          />
                        </td>
                        <td className={cellClass}>
                          {v?.varianceQty == null ? (
                            <span className="text-xs text-slate-400">{v?.note ?? "—"}</span>
                          ) : (
                            <>
                              <span className={v.varianceQty > 0 ? "font-medium text-red-600" : "text-slate-700"}>
                                {formatNumber(v.varianceQty)}
                              </span>
                              <div className="text-xs text-slate-400">
                                đầu {formatNumber(v.openingQty ?? 0)} + pha {formatNumber(v.preparedQty)} − bán{" "}
                                {formatNumber(v.soldQty)} − cuối {formatNumber(v.closingQty ?? 0)}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={onSaveCount} disabled={saveCount.isPending}>
                  {saveCount.isPending ? "Đang lưu..." : `Lưu số đếm (${totalCounted} món)`}
                </Button>
                <span className="text-xs text-slate-400">
                  Hao hụt chỉ tính được khi có số đếm ở <strong>cả hai đầu</strong> ca — thiếu một đầu thì để trống chứ
                  không suy, vì sai số của phép suy sẽ bị đọc thành lượng đổ đi.
                </span>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
