"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  type BakerySaleRowItem,
  type BakerySaleRowKey,
  useBakerySaleRows,
  useSaveBakerySales,
} from "@/hooks/useBakerySales";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

/** Hôm nay theo giờ VN — không cắt `toISOString()` của giờ máy, máy sai múi giờ sẽ lệch ngày. */
function todayVn(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

interface DraftRow {
  key: number;
  soldOn: string;
  shopUserId: string;
  finishedGoodItemId: string;
  quantity: string;
}

const cell = "border border-slate-200 px-3 py-2";
const head = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

/** "" = BÁN NGOÀI. Ngược quy ước "rỗng = của tôi" ở màn doanh số POS, nên nhãn phải nói rõ. */
const OUTSIDE = "";

/**
 * Nhập "bánh bán ra" của tiệm bánh — trục bán ra tương đương doanh số POS của quán.
 *
 * Hai khu tách biệt, vì danh sách có PHÂN TRANG: khu trên soạn dòng mới rồi lưu cả lô; khu dưới là
 * danh sách đã có, xoá từng dòng. Không dùng phép so cả bảng — màn chỉ tải 20 dòng nên phép so sẽ
 * tưởng những dòng không hiện đã bị xoá.
 */
export function BakerySaleEntry() {
  const { data: bakeries = [] } = useUserOptions({ scope: "bakery" });
  const { data: shops = [] } = useUserOptions({ scope: "shopOnly" });
  const save = useSaveBakerySales();

  const [bakeryUserId, setBakeryUserId] = useState("");
  const [from, setFrom] = useState(todayVn);
  const [to, setTo] = useState(todayVn);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Ô chọn bánh theo MENU CỦA TIỆM BÁNH — nó mới là bên bán.
  const { data: allItems = [] } = useFinishedGoodItems({ shopUserId: bakeryUserId || undefined });
  const items = useMemo(() => [...allItems].sort((a, b) => a.name.localeCompare(b.name)), [allItems]);

  const { data, isLoading } = useBakerySaleRows({ bakeryUserId: bakeryUserId || undefined, from, to, page, pageSize });
  const rows = data?.items ?? [];

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      { key: nextKey, soldOn: todayVn(), shopUserId: OUTSIDE, finishedGoodItemId: "", quantity: "" },
    ]);
    setNextKey((k) => k + 1);
  }

  function patchDraft(key: number, patch: Partial<DraftRow>) {
    setSaved(null);
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function saveDrafts() {
    setError(null);
    setSaved(null);
    if (!bakeryUserId) {
      setError("Chọn tiệm bánh trước.");
      return;
    }
    const incomplete = drafts.some((d) => !d.soldOn || !d.finishedGoodItemId || !(Number(d.quantity) > 0));
    if (incomplete) {
      setError("Mỗi dòng phải có đủ ngày, bánh và số lượng lớn hơn 0.");
      return;
    }
    // Trùng khoá cũng bị server chặn, nhưng báo ngay tại đây thì người dùng không phải chờ vòng gọi.
    const seen = new Set<string>();
    for (const d of drafts) {
      const k = `${d.shopUserId}|${d.soldOn}|${d.finishedGoodItemId}`;
      if (seen.has(k)) {
        setError("Có hai dòng cùng ngày, cùng người mua, cùng bánh — gộp lại thành một dòng.");
        return;
      }
      seen.add(k);
    }

    save.mutate(
      {
        bakeryUserId,
        upserts: drafts.map((d) => ({
          shopUserId: d.shopUserId === OUTSIDE ? null : d.shopUserId,
          soldOn: d.soldOn,
          finishedGoodItemId: d.finishedGoodItemId,
          quantity: Number(d.quantity),
        })),
        deletes: [],
      },
      {
        onSuccess: (r) => {
          setDrafts([]);
          setSaved(`Đã lưu ${r.written} dòng${r.replaced > 0 ? `, trong đó ${r.replaced} dòng ghi đè` : ""}.`);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu thất bại"),
      },
    );
  }

  function deleteRow(row: BakerySaleRowItem) {
    if (!confirm(`Xoá dòng ${row.finishedGoodItem.name} ngày ${row.soldOn.slice(0, 10)}?`)) return;
    setError(null);
    setSaved(null);
    const key: BakerySaleRowKey = {
      shopUserId: row.shopUserId,
      soldOn: row.soldOn.slice(0, 10),
      finishedGoodItemId: row.finishedGoodItemId,
    };
    save.mutate(
      { bakeryUserId, upserts: [], deletes: [key] },
      {
        onSuccess: (r) => setSaved(`Đã xoá ${r.deleted} dòng.`),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá thất bại"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bánh bán ra</CardTitle>
        <Button type="button" size="sm" onClick={addDraft} disabled={!bakeryUserId}>
          Thêm dòng
        </Button>
      </CardHeader>
      <CardBody className="flex flex-col gap-3 p-0">
        <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">
          Mỗi dòng là một ô <strong>(ngày, người mua, bánh)</strong>. Nhập lại cùng ô là <strong>ghi đè</strong>. Chọn{" "}
          <strong>&quot;Bán ngoài&quot;</strong> cho bánh bán cho người ngoài — các dòng bán ngoài trong cùng ngày của
          cùng một bánh được gộp làm một.
        </p>

        <div className="flex flex-wrap items-end gap-3 px-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Tiệm bánh</label>
            <Select
              className="w-56"
              value={bakeryUserId}
              onChange={(e) => {
                setBakeryUserId(e.target.value);
                setDrafts([]);
                setPage(1);
                setError(null);
                setSaved(null);
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
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Từ ngày</label>
            <Input
              type="date"
              className="w-40"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase text-slate-500">Đến ngày</label>
            <Input
              type="date"
              className="w-40"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {drafts.length > 0 && (
          <div className="mx-4 flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <p className="text-sm font-medium text-indigo-900">Dòng mới chưa lưu</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={head}>Ngày</th>
                    <th className={head}>Người mua</th>
                    <th className={head}>Bánh</th>
                    <th className={head}>SL</th>
                    <th className={head} />
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.key}>
                      <td className={cell}>
                        <Input
                          type="date"
                          className="w-36"
                          value={d.soldOn}
                          onChange={(e) => patchDraft(d.key, { soldOn: e.target.value })}
                        />
                      </td>
                      <td className={cell}>
                        <Select
                          className="w-44"
                          value={d.shopUserId}
                          onChange={(e) => patchDraft(d.key, { shopUserId: e.target.value })}
                        >
                          <option value={OUTSIDE}>Bán ngoài</option>
                          {shops.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={cell}>
                        <Select
                          className="w-56"
                          value={d.finishedGoodItemId}
                          onChange={(e) => patchDraft(d.key, { finishedGoodItemId: e.target.value })}
                        >
                          <option value="">Chọn bánh</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={cell}>
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          className="w-24"
                          value={d.quantity}
                          onChange={(e) => patchDraft(d.key, { quantity: e.target.value })}
                        />
                      </td>
                      <td className={cell}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDrafts((prev) => prev.filter((x) => x.key !== d.key))}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={saveDrafts} disabled={save.isPending}>
                {save.isPending ? "Đang lưu..." : `Lưu ${drafts.length} dòng`}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="px-4 text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="px-4 text-sm text-green-600">{saved}</p>}

        <div className="overflow-x-auto px-4">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={head}>Ngày</th>
                <th className={head}>Người mua</th>
                <th className={head}>Bánh</th>
                <th className={head}>SL</th>
                <th className={head} />
              </tr>
            </thead>
            <tbody>
              {!bakeryUserId && (
                <tr>
                  <td className={`${cell} text-slate-400`} colSpan={5}>
                    Chọn tiệm bánh để xem dữ liệu.
                  </td>
                </tr>
              )}
              {bakeryUserId && isLoading && (
                <tr>
                  <td className={`${cell} text-slate-400`} colSpan={5}>
                    Đang tải...
                  </td>
                </tr>
              )}
              {bakeryUserId && !isLoading && rows.length === 0 && (
                <tr>
                  <td className={`${cell} text-slate-400`} colSpan={5}>
                    Chưa có dòng nào trong khoảng ngày này.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={cell}>{row.soldOn.slice(0, 10)}</td>
                  <td className={cell}>
                    {row.shopUser ? row.shopUser.name : <Badge tone="yellow">Bán ngoài</Badge>}
                  </td>
                  <td className={cell}>
                    {row.finishedGoodItem.name}
                    <span className="ml-2 text-xs text-slate-400">{row.finishedGoodItem.code}</span>
                  </td>
                  <td className={cell}>
                    {formatNumber(Number(row.quantity))}
                    <span className="ml-1 text-xs text-slate-400">{row.finishedGoodItem.unit?.name ?? ""}</span>
                  </td>
                  <td className={cell}>
                    <Button type="button" variant="ghost" size="sm" onClick={() => deleteRow(row)}>
                      <Trash2 size={14} />
                    </Button>
                  </td>
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
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </CardBody>
    </Card>
  );
}
