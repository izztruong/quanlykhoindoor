"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import {
  useSaveManualRows,
  useShiftDefinitions,
  usePosSaleRows,
  type ManualRowKey,
  type PosSaleRowItem,
} from "@/hooks/usePosSales";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { POS_SALE_SOURCE_LABELS, type ShiftDefinition } from "@/types";
import { Info, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

/** Hôm nay theo giờ VN. Không cắt `toISOString()` của giờ máy — máy đặt sai múi giờ sẽ lệch ngày. */
function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function hh(n: number): string {
  return String(n).padStart(2, "0");
}

/** Ca chứa một giờ, suy từ khung giờ admin khai. Chỉ để hiện nhãn cho dễ nhập theo ca. */
function shiftLabelForHour(hour: number, shifts: ShiftDefinition[]): string {
  const mid = hour * 60 + 30;
  const found = shifts.find((s) => {
    const start = s.startHour * 60 + s.startMinute;
    const end = s.endHour * 60 + s.endMinute;
    return end <= start ? mid >= start || mid < end : mid >= start && mid < end;
  });
  return found ? ` (${found.name})` : "";
}

interface DraftRow {
  /** Khoá cục bộ của dòng nháp, không liên quan tới DB. */
  key: number;
  soldOn: string;
  hour: string;
  finishedGoodItemId: string;
  quantity: string;
}

/**
 * Nhập doanh số POS bằng tay, theo TỪNG DÒNG: ngày · món · giờ · số lượng.
 *
 * Người dùng tự khai giờ thật, nên dữ liệu gõ tay mịn đúng bằng dữ liệu từ file Excel. Muốn khai gọn cả
 * ca thì cứ đặt vào một giờ trong ca — cách nhập theo dòng bao trùm cách nhập theo ca.
 *
 * Hai khu tách biệt, vì danh sách có PHÂN TRANG: khu trên soạn dòng mới rồi lưu cả lô; khu dưới là danh
 * sách đã có, sửa/xoá **từng dòng**. Không dùng phép so cả bảng — màn chỉ tải 20 dòng nên phép so sẽ
 * tưởng những dòng không hiện đã bị xoá.
 */
export function ManualEntry() {
  const { data: users = [] } = useUserOptions();
  const { data: shifts = [] } = useShiftDefinitions();
  const { data: allItems = [] } = useFinishedGoodItems();
  const save = useSaveManualRows();

  const [from, setFrom] = useState(todayVn);
  const [to, setTo] = useState(todayVn);
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  /** SL và giờ người dùng đang sửa ở danh sách, khoá theo id dòng. */
  const [edits, setEdits] = useState<Record<string, { quantity?: string; hour?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const { data, isLoading } = usePosSaleRows({ userId: userId || undefined, from, to, page, pageSize });
  const rows = data?.items ?? [];

  // Chỉ món BÁN QUA POS. THANH_PHAM là đồ pha sẵn đếm ở phiếu kiểm kê — server cũng chặn, đây là lớp
  // hiển thị. Dữ liệu thật đã có 12 dòng Check Cost ghi nhầm vì hai tên chỉ khác chữ hoa.
  const sellableItems = useMemo(
    () => allItems.filter((it) => it.category !== "THANH_PHAM").sort((a, b) => a.name.localeCompare(b.name)),
    [allItems],
  );

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${hh(h)}:00${shiftLabelForHour(h, shifts)}` })),
    [shifts],
  );

  function addDraft() {
    setSaved(null);
    setDrafts((prev) => [...prev, { key: nextKey, soldOn: to, hour: "", finishedGoodItemId: "", quantity: "" }]);
    setNextKey((k) => k + 1);
  }

  function setDraft(key: number, patch: Partial<DraftRow>) {
    setSaved(null);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function saveDrafts() {
    const upserts = drafts.map((d) => ({
      soldOn: d.soldOn,
      hour: Number(d.hour),
      finishedGoodItemId: d.finishedGoodItemId,
      quantity: Number(d.quantity),
    }));
    const bad = upserts.find(
      (u) => !u.soldOn || !u.finishedGoodItemId || !Number.isInteger(u.hour) || !(u.quantity > 0),
    );
    if (bad || upserts.length === 0) {
      setError("Mỗi dòng phải có đủ ngày, món, giờ và số lượng lớn hơn 0");
      return;
    }
    // Trùng khoá cũng bị server chặn, nhưng báo ngay tại đây thì người dùng không phải chờ vòng gọi.
    const keys = new Set<string>();
    const dup = upserts.find((u) => !keys.add(`${u.soldOn}|${u.hour}|${u.finishedGoodItemId}`) && true);
    if (dup) {
      setError("Có hai dòng cùng ngày, cùng giờ, cùng món — gộp lại thành một dòng");
      return;
    }
    setError(null);
    save.mutate(
      { userId: userId || undefined, upserts },
      {
        onSuccess: (r) => {
          setDrafts([]);
          setSaved(
            `Đã lưu ${r.written} dòng` + (r.replaced > 0 ? ` (${r.replaced} dòng ghi đè lên dòng đã có).` : "."),
          );
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không lưu được dòng doanh số"),
      },
    );
  }

  function saveRow(row: PosSaleRowItem) {
    const edit = edits[row.id] ?? {};
    const hour = edit.hour !== undefined ? Number(edit.hour) : row.hour;
    const quantity = edit.quantity !== undefined ? Number(edit.quantity) : Number(row.quantity);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !(quantity > 0)) {
      setError("Giờ phải từ 0 đến 23 và số lượng phải lớn hơn 0");
      return;
    }
    const soldOn = row.soldOn.slice(0, 10);
    const upserts = [{ soldOn, hour, finishedGoodItemId: row.finishedGoodItem.id, quantity }];
    // Đổi giờ = xoá khoá cũ + ghi khoá mới, trong CÙNG một lần gọi để không có lúc nào mất dòng.
    const deletes: ManualRowKey[] =
      hour === row.hour ? [] : [{ soldOn, hour: row.hour, finishedGoodItemId: row.finishedGoodItem.id }];

    setError(null);
    save.mutate(
      { userId: userId || undefined, upserts, deletes },
      {
        onSuccess: () => {
          setEdits((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
          setSaved(`Đã lưu dòng ${row.finishedGoodItem.name}.`);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không lưu được dòng"),
      },
    );
  }

  function deleteRow(row: PosSaleRowItem) {
    setError(null);
    save.mutate(
      {
        userId: userId || undefined,
        deletes: [{ soldOn: row.soldOn.slice(0, 10), hour: row.hour, finishedGoodItemId: row.finishedGoodItem.id }],
      },
      {
        onSuccess: () => setSaved(`Đã xoá dòng ${row.finishedGoodItem.name} lúc ${hh(row.hour)}:00.`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Không xoá được dòng"),
      },
    );
  }

  const dirty = (row: PosSaleRowItem) => edits[row.id] !== undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhập tay từng dòng</CardTitle>
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            Mỗi dòng là <strong>một món bán trong một giờ</strong> — khai giờ thật nên số liệu mịn đúng bằng nhập từ
            file POS. Muốn khai gọn cả ca thì đặt tổng vào một giờ trong ca đó. Nhập lại cùng ngày/giờ/món là{" "}
            <strong>sửa</strong>, không cộng dồn.
          </div>
        </div>

        {/* Ô lọc — ô chọn quán ở đây RIÊNG với ô chọn quán của bảng tổng hợp theo ngày bên dưới. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Từ ngày</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Đến ngày</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Quán</label>
            <Select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
              className="w-48"
            >
              <option value="">Của tôi</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="button" variant="secondary" onClick={addDraft}>
            <Plus size={16} />
            Thêm dòng
          </Button>
        </div>

        {/* Khu soạn dòng mới */}
        {drafts.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <p className="text-xs font-medium uppercase text-slate-500">Dòng mới chưa lưu</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Ngày</th>
                    <th className={headClass}>Món</th>
                    <th className={headClass}>Giờ</th>
                    <th className={headClass}>SL</th>
                    <th className={`${headClass} w-12`} />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.key}>
                      <td className={cellClass}>
                        <input
                          type="date"
                          value={d.soldOn}
                          onChange={(e) => setDraft(d.key, { soldOn: e.target.value })}
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                        />
                      </td>
                      <td className={cellClass}>
                        <Select
                          className="w-56"
                          value={d.finishedGoodItemId}
                          onChange={(e) => setDraft(d.key, { finishedGoodItemId: e.target.value })}
                        >
                          <option value="">Chọn món</option>
                          {sellableItems.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} ({it.code})
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={cellClass}>
                        <Select className="w-40" value={d.hour} onChange={(e) => setDraft(d.key, { hour: e.target.value })}>
                          <option value="">Chọn giờ</option>
                          {hourOptions.map((h) => (
                            <option key={h.value} value={h.value}>
                              {h.label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={cellClass}>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          className="w-20"
                          value={d.quantity}
                          onChange={(e) => setDraft(d.key, { quantity: e.target.value })}
                        />
                      </td>
                      <td className={cellClass}>
                        <button
                          type="button"
                          onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Bỏ dòng này"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <Button type="button" onClick={saveDrafts} disabled={save.isPending}>
                <Save size={16} />
                {save.isPending ? "Đang lưu..." : `Lưu ${drafts.length} dòng`}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">{saved}</p>}

        {/* Danh sách đã có */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={headClass}>Ngày</th>
                <th className={headClass}>Giờ</th>
                <th className={headClass}>Món</th>
                <th className={headClass}>SL</th>
                <th className={headClass}>Nguồn</th>
                <th className={`${headClass} w-24`} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className={cellClass} colSpan={6}>
                    <span className="text-slate-500">Đang tải…</span>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className={cellClass} colSpan={6}>
                    <span className="text-slate-500">
                      Không có dòng nào trong khoảng đã chọn. Bấm <strong>Thêm dòng</strong> để nhập.
                    </span>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={dirty(row) ? "bg-amber-50" : undefined}>
                    <td className={cellClass}>{row.soldOn.slice(0, 10)}</td>
                    <td className={cellClass}>
                      <Select
                        className="w-40"
                        value={String(edits[row.id]?.hour ?? row.hour)}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], hour: e.target.value } }))
                        }
                      >
                        {hourOptions.map((h) => (
                          <option key={h.value} value={h.value}>
                            {h.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={cellClass}>
                      <div className="font-medium text-slate-800">{row.finishedGoodItem.name}</div>
                      <div className="text-xs text-slate-400">{row.finishedGoodItem.code}</div>
                    </td>
                    <td className={cellClass}>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        className="w-20"
                        value={edits[row.id]?.quantity ?? String(Number(row.quantity))}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [row.id]: { ...prev[row.id], quantity: e.target.value } }))
                        }
                      />
                    </td>
                    <td className={cellClass}>
                      <Badge tone={row.source === "EXCEL" ? "blue" : "green"}>
                        {POS_SALE_SOURCE_LABELS[row.source]}
                      </Badge>
                    </td>
                    <td className={cellClass}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveRow(row)}
                          disabled={!dirty(row) || save.isPending}
                          className="text-slate-400 hover:text-indigo-600 disabled:opacity-30"
                          aria-label="Lưu dòng này"
                        >
                          <Save size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRow(row)}
                          disabled={save.isPending}
                          className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                          aria-label="Xoá dòng này"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={data?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />

        <p className="text-xs text-slate-400">
          Tổng SL trong khoảng đang xem (trang này): <strong>{formatNumber(rows.reduce((s, r) => s + Number(r.quantity), 0))}</strong>
        </p>
      </CardBody>
    </Card>
  );
}
