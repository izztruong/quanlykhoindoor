"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useDeadlines, useSaveDeadline, type DeadlineInput } from "@/hooks/useDeadlines";
import { ApiError } from "@/lib/api-client";
import { WEEKDAYS, deadlineKindLabel, describeDeadline } from "@/lib/deadlines";
import type { DeadlineKind } from "@/types";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

const cellClass = "border border-slate-200 px-4 py-2 align-top";
const headClass = "border border-slate-200 px-4 py-2 text-left font-medium text-slate-600";

const KINDS: DeadlineKind[] = ["SALES_ORDER", "STOCK_CHECK_WEEKLY", "STOCK_CHECK_MONTHLY"];

/** Mặc định dùng khi server chưa có dòng nào cho loại đó — khớp với migration seed. */
const FALLBACK: Record<DeadlineKind, DeadlineInput> = {
  SALES_ORDER: { kind: "SALES_ORDER", weekday: null, periodWeekday: null, graceDays: 0, hour: 22, minute: 0 },
  STOCK_CHECK_WEEKLY: { kind: "STOCK_CHECK_WEEKLY", weekday: 2, periodWeekday: 1, graceDays: 0, hour: 12, minute: 0 },
  STOCK_CHECK_MONTHLY: { kind: "STOCK_CHECK_MONTHLY", weekday: null, periodWeekday: null, graceDays: 1, hour: 12, minute: 0 },
};

export default function DeadlinesPage() {
  const { data: deadlines, isLoading } = useDeadlines();
  const saveDeadline = useSaveDeadline();

  const [drafts, setDrafts] = useState<Record<DeadlineKind, DeadlineInput>>(FALLBACK);
  const [savedKind, setSavedKind] = useState<DeadlineKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Đổ dữ liệu server vào form một lần khi tải xong, sau đó form tự giữ trạng thái đang gõ.
  useEffect(() => {
    if (!deadlines) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const rule of deadlines) {
        next[rule.kind] = {
          kind: rule.kind,
          weekday: rule.weekday,
          periodWeekday: rule.periodWeekday,
          graceDays: rule.graceDays,
          hour: rule.hour,
          minute: rule.minute,
        };
      }
      return next;
    });
  }, [deadlines]);

  function update(kind: DeadlineKind, patch: Partial<DeadlineInput>) {
    setSavedKind(null);
    setDrafts((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
  }

  function save(kind: DeadlineKind) {
    setError(null);
    setSavedKind(null);
    saveDeadline.mutate(drafts[kind], {
      onSuccess: () => setSavedKind(kind),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu hạn thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Hạn order &amp; kiểm kê</h1>
        <p className="text-sm text-slate-500">
          Đơn hàng và phiếu kiểm nộp sau hạn sẽ bị đánh dấu chấm đỏ ở danh sách. Lịch này dùng chung cho mọi quán.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lịch hạn nộp</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={headClass}>Loại</th>
                  <th className={headClass}>Ngày kiểm</th>
                  <th className={headClass}>Thứ phải nộp</th>
                  <th className={headClass}>Ân hạn</th>
                  <th className={headClass}>Giờ hạn</th>
                  <th className={headClass}>Nghĩa là</th>
                  <th className={headClass}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className={`${cellClass} text-slate-500`} colSpan={7}>
                      Đang tải…
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  KINDS.map((kind) => {
                    const draft = drafts[kind];
                    return (
                      <tr key={kind} className="hover:bg-slate-50">
                        <td className={cellClass}>{deadlineKindLabel[kind]}</td>
                        {/* Ngày kiểm là mốc MỞ KỲ, hạn được tính tiến lên từ đó — nên phải chọn cả
                            hai, không suy ra được từ tuần lịch cố định. */}
                        <td className={cellClass}>
                          {kind === "STOCK_CHECK_WEEKLY" ? (
                            <Select
                              className="h-8 w-32"
                              value={draft.periodWeekday ?? ""}
                              onChange={(e) => update(kind, { periodWeekday: Number(e.target.value) })}
                            >
                              {WEEKDAYS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={cellClass}>
                          {kind === "STOCK_CHECK_WEEKLY" ? (
                            <Select
                              className="h-8 w-32"
                              value={draft.weekday ?? ""}
                              onChange={(e) => update(kind, { weekday: Number(e.target.value) })}
                            >
                              {WEEKDAYS.map((d) => (
                                <option key={d.value} value={d.value}>
                                  {d.label}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={cellClass}>
                          {kind === "STOCK_CHECK_MONTHLY" ? (
                            <span className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={31}
                                className="h-8 w-16"
                                value={draft.graceDays}
                                onChange={(e) => update(kind, { graceDays: Number(e.target.value) })}
                              />
                              <span className="text-slate-500">ngày</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={cellClass}>
                          <Input
                            type="time"
                            className="h-8 w-32"
                            // Ô time chỉ trao đổi chuỗi "HH:mm" thuần, không kèm ngày nên không đi
                            // qua chuyển đổi múi giờ nào — giờ lưu xuống DB đúng bằng giờ nhìn thấy.
                            value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`}
                            onChange={(e) => {
                              const [h, m] = e.target.value.split(":");
                              update(kind, { hour: Number(h), minute: Number(m) });
                            }}
                          />
                        </td>
                        <td className={`${cellClass} text-slate-600`}>{describeDeadline(draft)}</td>
                        <td className={cellClass}>
                          <span className="flex items-center gap-2">
                            <Button size="sm" onClick={() => save(kind)} disabled={saveDeadline.isPending}>
                              <Save size={14} />
                              Lưu
                            </Button>
                            {savedKind === kind && <span className="text-emerald-600">Đã lưu</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-2 text-sm text-slate-600">
          <p>
            <strong>Sửa hạn chỉ áp dụng cho đơn và phiếu tạo từ đây trở đi.</strong> Dấu đúng hạn/muộn được chốt ngay lúc tạo bản
            ghi, nên chỉnh giờ hôm nay không làm đổi màu những gì đã có — lịch sử giữ nguyên.
          </p>
          <p>
            Ý nghĩa các chấm ở danh sách: <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 align-middle" />{" "}
            đúng hạn, <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500 align-middle" /> muộn,{" "}
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300 align-middle" /> chưa đánh giá (bản ghi tạo trước
            khi có chức năng này, hoặc phiếu kiểm chưa chọn loại).
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
