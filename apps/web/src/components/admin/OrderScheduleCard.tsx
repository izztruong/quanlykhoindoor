"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useOrderSchedule, useSaveOrderSchedule } from "@/hooks/useOrderSchedule";
import { ApiError } from "@/lib/api-client";
import { WEEKDAY_LABELS } from "@/types";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Khai các thứ trong tuần quán gọi đồ. Quyết định **số ngày mỗi đơn phải phủ**: khoảng cách từ hôm nay
 * tới ngày gọi kế tiếp. Gọi tối CN thì phủ tới T5 (4 ngày), gọi tối T5 thì phủ tới CN (3 ngày) — một
 * con số khai cứng không dùng được cho cả hai kỳ, nên phải suy từ lịch.
 *
 * Không đồng bộ dữ liệu server vào state bằng `useEffect` (gây render lồng, và là lỗi lint của dự án):
 * ô tick nào người dùng chưa bấm thì đọc thẳng giá trị từ server lúc render.
 */
export function OrderScheduleCard() {
  const { data: savedWeekdays, isLoading } = useOrderSchedule();
  const saveSchedule = useSaveOrderSchedule();

  const [picked, setPicked] = useState<Record<number, boolean> | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedSet = useMemo(() => new Set(savedWeekdays ?? []), [savedWeekdays]);
  const isChecked = (weekday: number) => picked?.[weekday] ?? savedSet.has(weekday);
  const selected = WEEKDAYS.filter(isChecked);

  function toggle(weekday: number) {
    setSaved(false);
    setPicked((prev) => ({ ...(prev ?? {}), [weekday]: !isChecked(weekday) }));
  }

  function onSave() {
    setError(null);
    setSaved(false);
    saveSchedule.mutate(selected, {
      onSuccess: () => {
        setSaved(true);
        setPicked(null);
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu lịch gọi đồ thất bại"),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ngày gọi đồ</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Quán gọi đồ vào những thứ nào. Dùng để tự tính <strong>số ngày mỗi đơn phải phủ</strong> — khoảng cách tới lần
          gọi kế tiếp. Số ngày chờ hàng về không ảnh hưởng con số này (lô nào cũng chờ như nhau nên triệt tiêu), mà khai
          riêng theo từng hàng hoá ở Danh mục › Hàng hoá.
        </p>

        {isLoading ? (
          <p className="text-sm text-slate-400">Đang tải...</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((weekday) => (
              <label
                key={weekday}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  isChecked(weekday) ? "border-slate-400 bg-slate-100 font-medium text-slate-800" : "border-slate-200 text-slate-600"
                }`}
              >
                <input type="checkbox" checked={isChecked(weekday)} onChange={() => toggle(weekday)} />
                {WEEKDAY_LABELS[weekday]}
              </label>
            ))}
          </div>
        )}

        {selected.length === 0 ? (
          <p className="text-sm text-amber-600">
            Chưa chọn ngày nào — phần gợi ý đặt hàng sẽ không tự tính được số ngày phủ, người dùng phải gõ tay mỗi lần.
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            Gọi {selected.length} lần/tuần:{" "}
            {selected
              .map((weekday) => {
                const next = selected.find((w) => w > weekday) ?? selected[0] + 7;
                return `${WEEKDAY_LABELS[weekday]} phủ ${next - weekday} ngày`;
              })
              .join(" · ")}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">Đã lưu lịch gọi đồ.</p>}

        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={saveSchedule.isPending}>
            <Save size={14} />
            {saveSchedule.isPending ? "Đang lưu..." : "Lưu lịch gọi đồ"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
