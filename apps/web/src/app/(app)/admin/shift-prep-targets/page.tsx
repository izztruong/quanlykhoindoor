"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useShiftDefinitions } from "@/hooks/usePosSales";
import { useSaveShiftPrepTargets, useShiftPrepTargets, type ShiftPrepTargetInput } from "@/hooks/useShiftPrepTargets";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { PREP_MODE_LABELS, type PrepMode, type ShiftCode } from "@/types";
import { Save } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-2 py-2 align-top";
const headClass = "border border-slate-200 px-2 py-2 text-left text-xs font-medium uppercase text-slate-500";

const MODE_OPTIONS = (Object.keys(PREP_MODE_LABELS) as PrepMode[]).map((value) => ({ value, label: PREP_MODE_LABELS[value] }));

/** Khoá ô nhập: một dòng của bảng là (món × ca). */
function key(finishedGoodItemId: string, shift: ShiftCode): string {
  return `${finishedGoodItemId}|${shift}`;
}

export default function ShiftPrepTargetsPage() {
  const { data: users = [] } = useUserOptions();
  const { data: shifts = [] } = useShiftDefinitions();
  const { data: allItems = [] } = useFinishedGoodItems();
  const [userId, setUserId] = useState("");
  const { data: targets = [] } = useShiftPrepTargets(userId || undefined);
  const save = useSaveShiftPrepTargets();

  const [overrides, setOverrides] = useState<Record<string, { mode?: PrepMode; targetLevel?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");

  // Chỉ món "phải pha trước" — đúng danh sách của màn Chuẩn bị ca, để hai bên không lệch nhau.
  const items = useMemo(() => {
    const prepared = allItems.filter((it) => it.prepared);
    const q = search.trim().toLowerCase();
    return q ? prepared.filter((it) => it.name.toLowerCase().includes(q)) : prepared;
  }, [allItems, search]);

  const savedByKey = useMemo(() => new Map(targets.map((t) => [key(t.finishedGoodItemId, t.shift), t])), [targets]);

  function modeOf(itemId: string, shift: ShiftCode): PrepMode {
    const o = overrides[key(itemId, shift)]?.mode;
    if (o) return o;
    return savedByKey.get(key(itemId, shift))?.mode ?? "TARGET_LEVEL";
  }

  function levelOf(itemId: string, shift: ShiftCode): string {
    const o = overrides[key(itemId, shift)]?.targetLevel;
    if (o !== undefined) return o;
    const value = savedByKey.get(key(itemId, shift))?.targetLevel;
    return value == null ? "" : String(Number(value));
  }

  function setCell(itemId: string, shift: ShiftCode, patch: { mode?: PrepMode; targetLevel?: string }) {
    setSaved(false);
    setOverrides((prev) => ({ ...prev, [key(itemId, shift)]: { ...prev[key(itemId, shift)], ...patch } }));
  }

  function onSave() {
    if (!userId) {
      setError("Chọn quán trước");
      return;
    }
    setError(null);
    setSaved(false);

    // Chỉ gửi ô đã sửa trong phiên này — gửi cả bảng (món × 3 ca) là vài trăm dòng mỗi lần lưu.
    const payload: ShiftPrepTargetInput[] = Object.keys(overrides).map((k) => {
      const [finishedGoodItemId, shift] = k.split("|") as [string, ShiftCode];
      const mode = modeOf(finishedGoodItemId, shift);
      const raw = levelOf(finishedGoodItemId, shift).trim();
      return { finishedGoodItemId, shift, mode, targetLevel: raw === "" ? null : Number(raw) };
    });

    const missing = payload.find((p) => p.mode === "TARGET_LEVEL" && p.targetLevel == null);
    if (missing) {
      const name = allItems.find((it) => it.id === missing.finishedGoodItemId)?.name ?? missing.finishedGoodItemId;
      setError(`"${name}" ở ${missing.shift} đang theo mức mục tiêu nhưng chưa nhập mức — nhập số hoặc chuyển chế độ khác`);
      return;
    }
    if (payload.length === 0) {
      setSaved(true);
      return;
    }

    save.mutate(
      { userId, items: payload },
      {
        onSuccess: () => {
          setSaved(true);
          setOverrides({});
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu mức chuẩn bị thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Mức chuẩn bị theo ca</h1>
        <p className="text-sm text-slate-500">
          Mỗi quán × món × ca một dòng: ca tối khác ca sáng, và mỗi quán một lượng khách. Chế độ{" "}
          <strong>theo mức mục tiêu</strong> chạy được ngay từ ngày đầu; chế độ <strong>theo dự báo</strong> chỉ nên bật
          khi món đó đã có vài tuần doanh số POS — chưa đủ thì màn Chuẩn bị ca sẽ nói rõ và không đề xuất bừa.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Quán</label>
            <Select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-56">
              <option value="">Chọn quán</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Tìm món</label>
            <Input placeholder="Tên món..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </div>
          <Button type="button" onClick={onSave} disabled={!userId || save.isPending}>
            <Save size={16} />
            {save.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Đã lưu mức chuẩn bị.</p>}

      {userId && (
        <Card>
          <CardBody className="overflow-x-auto">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">
                Chưa có món nào tick &ldquo;phải pha trước mỗi ca&rdquo;. Tick ở Danh mục › Đồ thành phẩm rồi quay lại.
              </p>
            ) : (
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Món</th>
                    {shifts.map((s) => (
                      <th key={s.code} className={headClass} colSpan={2}>
                        {s.name}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className={headClass} />
                    {shifts.map((s) => (
                      <Fragment key={s.code}>
                        <th className={headClass}>Chế độ</th>
                        <th className={headClass}>Mức mục tiêu</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className={cellClass}>
                        <div className="font-medium text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-400">
                          {item.code} · {item.unit?.name ?? "-"}
                          {item.batchSize != null && ` · 1 mẻ = ${Number(item.batchSize)}`}
                        </div>
                      </td>
                      {shifts.map((s) => (
                        <Fragment key={s.code}>
                          <td className={cellClass}>
                            <Select
                              className="w-36"
                              value={modeOf(item.id, s.code)}
                              onChange={(e) => setCell(item.id, s.code, { mode: e.target.value as PrepMode })}
                            >
                              {MODE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className={cellClass}>
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              className="w-20"
                              value={levelOf(item.id, s.code)}
                              onChange={(e) => setCell(item.id, s.code, { targetLevel: e.target.value })}
                              disabled={modeOf(item.id, s.code) !== "TARGET_LEVEL"}
                            />
                          </td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
