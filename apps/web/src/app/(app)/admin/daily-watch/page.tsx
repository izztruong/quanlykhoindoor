"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useDailyWatch, useDailyWatchHistory, useRunDailyWatch } from "@/hooks/useDailyWatch";
import { formatCurrency, formatNumber } from "@/lib/format";
import { DAILY_WATCH_KIND_LABELS, type DailyWatchFinding, type DailyWatchKind } from "@/types";
import { AlertTriangle, ArrowRightLeft, Clock, PackageCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { Fragment, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

const KIND_TONE: Record<DailyWatchKind, "red" | "yellow" | "green" | "blue"> = {
  SHORTFALL: "red",
  TRANSFER: "yellow",
  FREE_SHIP_READY: "green",
  ORDER_DUE: "blue",
};

const KIND_ICON: Record<DailyWatchKind, typeof AlertTriangle> = {
  SHORTFALL: AlertTriangle,
  TRANSFER: ArrowRightLeft,
  FREE_SHIP_READY: PackageCheck,
  ORDER_DUE: Clock,
};

/** Mốc thời gian theo giờ VN. Không cắt chuỗi ISO — xem lib/dateRange. */
function vnDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function daysLeftLabel(f: DailyWatchFinding): string {
  if (f.daysLeft == null) return "—";
  const n = Number(f.daysLeft);
  return n <= 0 ? "đã hết" : `${formatNumber(n)} ngày`;
}

export default function DailyWatchPage() {
  const [businessDate, setBusinessDate] = useState("");
  const { data: run, isLoading, isError } = useDailyWatch(businessDate || undefined);
  const { data: history = [] } = useDailyWatchHistory();
  const runNow = useRunDailyWatch();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [kindFilter, setKindFilter] = useState<DailyWatchKind | "">("");

  const findings = run?.findings ?? [];
  const shown = kindFilter ? findings.filter((f) => f.kind === kindFilter) : findings;
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Theo dõi cuối ngày</h1>
        <p className="text-sm text-slate-500">
          Mỗi tối hệ thống tự tính: quán nào sắp hết nguyên liệu trước ngày gọi kế tiếp, quán nào đang dư để chuyển sang,
          đơn nào đã đủ ngưỡng miễn ship. Đơn và phiếu vẫn do người chốt — đây chỉ là danh sách việc, xếp theo mức gấp.
        </p>
      </div>

      {/* Giới hạn phải nói rõ ngay trên màn: một con số cũ trông y hệt một con số mới. */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <strong>Không bắt được &ldquo;đông đột biến&rdquo; theo thời gian thực.</strong> Doanh số POS nhập tay, nên hệ
          thống chỉ biết sau khi có người nhập — sớm nhất là <strong>cuối ca</strong>. Cuối ca sáng Chủ nhật thấy tồn hụt
          thì còn kịp điều chuyển cho ca chiều, nhưng không thể cảnh báo lúc 10 giờ sáng.
          {run?.finishedAt ? (
            <>
              {" "}
              Số liệu dưới đây tính lúc <strong>{vnDateTime(run.finishedAt)}</strong>.
            </>
          ) : run ? (
            <> Lượt này chưa chạy xong.</>
          ) : null}
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Ngày kinh doanh</label>
            <select
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Lượt gần nhất</option>
              {history.map((h) => (
                <option key={h.id} value={String(h.businessDate).slice(0, 10)}>
                  {String(h.businessDate).slice(0, 10)} — {h._count.findings} việc
                  {h.error ? " (lỗi)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <RefreshCw size={16} />
            {runNow.isPending ? "Đang tính..." : "Tính lại hôm nay"}
          </Button>
          <span className="max-w-md text-xs text-slate-400">
            Lượt tối do GitHub Actions gọi (22:30 giờ VN, sau khi ca cuối đã nhập doanh số). Bấm đây là tính lại cho hôm
            nay — ghi đè lượt cũ, không bắn thông báo.
          </span>
        </CardBody>
      </Card>

      {run?.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Lượt chạy này bị lỗi:</strong> {run.error}
          <div className="mt-1 text-xs">
            Danh sách dưới đây có thể thiếu. Bấm &ldquo;Tính lại hôm nay&rdquo; hoặc xem nhật ký ở tab Actions trên GitHub.
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">Không tải được số liệu.</p>
      ) : !run ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              Chưa có lượt chạy nào. Bấm &ldquo;Tính lại hôm nay&rdquo;, hoặc đặt hai secret{" "}
              <strong>DAILY_WATCH_API_ORIGIN</strong> và <strong>DAILY_WATCH_TOKEN</strong> trên GitHub để lượt tối tự
              chạy.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setKindFilter("")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                kindFilter === "" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600"
              }`}
            >
              Tất cả ({findings.length})
            </button>
            {(Object.keys(DAILY_WATCH_KIND_LABELS) as DailyWatchKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindFilter(kind === kindFilter ? "" : kind)}
                disabled={!counts[kind]}
                className={`rounded-full border px-3 py-1 text-xs font-medium disabled:opacity-40 ${
                  kindFilter === kind ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600"
                }`}
              >
                {DAILY_WATCH_KIND_LABELS[kind]} ({counts[kind] ?? 0})
              </button>
            ))}
            <span className="text-xs text-slate-400">
              {run.shopCount} quán · ngày {String(run.businessDate).slice(0, 10)} · nguồn{" "}
              {run.triggeredBy === "CRON" ? "lượt tối tự chạy" : `bấm tay${run.triggeredBy_ ? ` (${run.triggeredBy_.name})` : ""}`}
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Việc cần xử lý — gấp nhất lên đầu</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              {shown.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {findings.length === 0
                    ? "Lượt này không nêu việc gì: không quán nào sắp hết trước ngày gọi, và không đơn nào đã đủ ngưỡng miễn ship."
                    : "Không có việc nào thuộc loại đang lọc."}
                </p>
              ) : (
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={`${headClass} w-6`} />
                      <th className={headClass}>Loại</th>
                      <th className={headClass}>Việc</th>
                      <th className={headClass}>Quán</th>
                      <th className={headClass}>Còn lại</th>
                      <th className={headClass}>Tới mốc gọi</th>
                      <th className={headClass}>SL / Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((f) => {
                      const Icon = KIND_ICON[f.kind];
                      return (
                        <Fragment key={f.id}>
                          <tr className={f.kind === "SHORTFALL" ? "bg-red-50" : undefined}>
                            <td className={cellClass}>
                              <button
                                type="button"
                                onClick={() => setExpanded((prev) => ({ ...prev, [f.id]: !prev[f.id] }))}
                                className="text-slate-400 hover:text-slate-600"
                                aria-label="Xem lý do"
                              >
                                <Icon size={14} />
                              </button>
                            </td>
                            <td className={cellClass}>
                              <Badge tone={KIND_TONE[f.kind]}>{DAILY_WATCH_KIND_LABELS[f.kind]}</Badge>
                              {f.kind === "TRANSFER" && (
                                <div className="mt-1">
                                  <Badge tone={f.freeTransfer ? "green" : "red"}>
                                    {f.freeTransfer ? "kịp ngày miễn ship" : "mất ship"}
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className={cellClass}>{f.title}</td>
                            <td className={cellClass}>
                              {f.fromUser ? `${f.fromUser.name} → ${f.user.name}` : f.user.name}
                            </td>
                            <td className={cellClass}>
                              <span className={Number(f.daysLeft ?? 99) <= 1 ? "font-semibold text-red-600" : undefined}>
                                {daysLeftLabel(f)}
                              </span>
                            </td>
                            <td className={cellClass}>{f.daysToOrder == null ? "—" : `${f.daysToOrder} ngày`}</td>
                            <td className={cellClass}>
                              {f.amount != null
                                ? formatCurrency(f.amount)
                                : f.quantity != null
                                  ? `${formatNumber(f.quantity)} ${f.product?.unit?.name ?? ""}`.trim()
                                  : "—"}
                            </td>
                          </tr>
                          {expanded[f.id] && (
                            <tr>
                              <td className={cellClass} />
                              <td className={cellClass} colSpan={6}>
                                <ul className="list-inside list-disc text-xs text-slate-600">
                                  {f.reasons.map((reason, i) => (
                                    <li key={`${f.id}-${i}`}>{reason}</li>
                                  ))}
                                </ul>
                                {f.kind === "TRANSFER" && (
                                  <p className="mt-2 text-xs text-slate-500">
                                    Phiếu điều chuyển <strong>chưa tự sinh</strong>: hệ thống chưa kiểm được quán nhận có
                                    đủ hàng dùng tới ngày chuyển hay không. Tạo phiếu ở{" "}
                                    <strong>Kho › Phiếu điều chuyển</strong> sau khi xem lại hai con số tồn ở trên.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
