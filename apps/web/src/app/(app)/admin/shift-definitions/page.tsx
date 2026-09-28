"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useSaveShiftDefinition, useShiftDefinitions } from "@/hooks/usePosSales";
import { ApiError } from "@/lib/api-client";
import type { ShiftCode, ShiftDefinition } from "@/types";
import { Save } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-4 py-2 align-top";
const headClass = "border border-slate-200 px-4 py-2 text-left font-medium text-slate-600";

const CODES: ShiftCode[] = ["CA1", "CA2", "CA3"];

type Draft = Omit<ShiftDefinition, "id">;

/** Mặc định khi chưa có dòng nào trên server — ca 3 cố ý qua nửa đêm để thấy ngay trường hợp đó. */
const FALLBACK: Record<ShiftCode, Draft> = {
  CA1: { code: "CA1", name: "Ca sáng", startHour: 6, startMinute: 0, endHour: 14, endMinute: 0 },
  CA2: { code: "CA2", name: "Ca chiều", startHour: 14, startMinute: 0, endHour: 22, endMinute: 0 },
  CA3: { code: "CA3", name: "Ca tối", startHour: 22, startMinute: 0, endHour: 2, endMinute: 0 },
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function describe(draft: Draft): string {
  const overnight = draft.endHour * 60 + draft.endMinute <= draft.startHour * 60 + draft.startMinute;
  const range = `${pad(draft.startHour)}:${pad(draft.startMinute)} → ${pad(draft.endHour)}:${pad(draft.endMinute)}`;
  return overnight ? `${range} (qua nửa đêm, tính về ngày hôm trước)` : range;
}

export default function ShiftDefinitionsPage() {
  const { data: shifts, isLoading } = useShiftDefinitions();
  const saveShift = useSaveShiftDefinition();

  // Chỉ giữ những ô admin đã sửa trong lượt này; ô chưa sửa đọc thẳng giá trị từ server (xem draftFor).
  // Cố ý KHÔNG đồng bộ dữ liệu server vào state bằng useEffect — kiểu đó gây render lồng và là lỗi lint.
  const [overrides, setOverrides] = useState<Partial<Record<ShiftCode, Partial<Draft>>>>({});
  const [savedCode, setSavedCode] = useState<ShiftCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savedByCode = useMemo(() => new Map((shifts ?? []).map((s) => [s.code, s])), [shifts]);

  function draftFor(code: ShiftCode): Draft {
    const saved = savedByCode.get(code);
    const base: Draft = saved
      ? {
          code,
          name: saved.name,
          startHour: saved.startHour,
          startMinute: saved.startMinute,
          endHour: saved.endHour,
          endMinute: saved.endMinute,
        }
      : FALLBACK[code];
    return { ...base, ...overrides[code] };
  }

  function update(code: ShiftCode, patch: Partial<Draft>) {
    setSavedCode(null);
    setOverrides((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));
  }

  function save(code: ShiftCode) {
    setError(null);
    setSavedCode(null);
    saveShift.mutate(draftFor(code), {
      onSuccess: () => {
        setSavedCode(code);
        // Bỏ override sau khi lưu để ô đọc lại từ server — tránh hiện số cũ nếu server chuẩn hoá khác.
        setOverrides((prev) => ({ ...prev, [code]: undefined }));
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu khung giờ ca thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Khung giờ ca</h1>
        <p className="text-sm text-slate-500">
          Dùng chung cho mọi quán. Doanh số POS lưu theo <strong>giờ</strong> rồi mới cắt ca, nên đổi khung giờ ở đây là số
          liệu theo ca tự tính lại — <strong>không phải nhập lại dữ liệu</strong>. Giờ kết thúc sớm hơn giờ bắt đầu nghĩa là
          ca chạy qua nửa đêm, và phần sau 0 giờ được tính về ngày hôm trước.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">Đang tải...</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Ba ca trong ngày</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={headClass}>Ca</th>
                  <th className={headClass}>Tên hiển thị</th>
                  <th className={headClass}>Bắt đầu</th>
                  <th className={headClass}>Kết thúc</th>
                  <th className={headClass}>Khoảng giờ</th>
                  <th className={headClass}></th>
                </tr>
              </thead>
              <tbody>
                {CODES.map((code) => {
                  const draft = draftFor(code);
                  return (
                    <tr key={code}>
                      <td className={cellClass}>{code}</td>
                      <td className={cellClass}>
                        <Input className="w-36" value={draft.name} onChange={(e) => update(code, { name: e.target.value })} />
                      </td>
                      {/* Hai ô số nguyên chứ KHÔNG dùng datetime-local: mốc giờ đi qua ô đó rồi lưu lại
                          sẽ bị trừ dần phần lệch múi giờ mỗi lần lưu (xem chú thích ở lib/dateRange.ts). */}
                      <td className={cellClass}>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            className="w-16"
                            value={draft.startHour}
                            onChange={(e) => update(code, { startHour: Number(e.target.value) })}
                          />
                          <span className="text-slate-400">:</span>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            className="w-16"
                            value={draft.startMinute}
                            onChange={(e) => update(code, { startMinute: Number(e.target.value) })}
                          />
                        </div>
                      </td>
                      <td className={cellClass}>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max="23"
                            className="w-16"
                            value={draft.endHour}
                            onChange={(e) => update(code, { endHour: Number(e.target.value) })}
                          />
                          <span className="text-slate-400">:</span>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            className="w-16"
                            value={draft.endMinute}
                            onChange={(e) => update(code, { endMinute: Number(e.target.value) })}
                          />
                        </div>
                      </td>
                      <td className={`${cellClass} text-slate-500`}>{describe(draft)}</td>
                      <td className={cellClass}>
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" onClick={() => save(code)} disabled={saveShift.isPending}>
                            <Save size={14} />
                            Lưu
                          </Button>
                          {savedCode === code && <span className="text-xs text-green-600">Đã lưu</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-xs text-slate-400">
        Ba ca không bắt buộc phủ kín 24 giờ — quán đóng cửa ban đêm thì khoảng trống là bình thường, và doanh số rơi vào
        khoảng trống đó sẽ không thuộc ca nào.
      </p>
    </div>
  );
}
