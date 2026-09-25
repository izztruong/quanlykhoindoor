"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import {
  useDeletePosItemMapping,
  usePosItemMappings,
  useSavePosItemMappings,
  useSuggestPosMappings,
} from "@/hooks/usePosSales";
import { ApiError } from "@/lib/api-client";
import { Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

export default function PosItemMappingPage() {
  const { data: mappings = [], isLoading } = usePosItemMappings();
  const { data: finishedGoodOptions = [] } = useFinishedGoodItems();
  const suggest = useSuggestPosMappings();
  const saveMappings = useSavePosItemMappings();
  const deleteMapping = useDeletePosItemMapping();

  // Danh sách tên POS đang chờ ánh xạ. Người dùng dán từ thông báo của màn nhập doanh số, mỗi dòng một tên.
  const [pendingText, setPendingText] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const pendingNames = useMemo(
    () =>
      [...new Set(pendingText.split("\n").map((line) => line.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [pendingText],
  );

  const suggestionByName = useMemo(
    () => new Map((suggest.data ?? []).map((s) => [s.posNameRaw, s.suggestions])),
    [suggest.data],
  );

  function runSuggest() {
    setError(null);
    if (pendingNames.length === 0) return;
    suggest.mutate(pendingNames, {
      onSuccess: (items) => {
        // Chọn sẵn gợi ý tốt nhất cho mỗi dòng, nhưng KHÔNG tự lưu — người vẫn xác nhận từng dòng.
        setChoices((prev) => {
          const next = { ...prev };
          for (const item of items) {
            if (next[item.posNameRaw] === undefined && item.suggestions[0]) {
              next[item.posNameRaw] = item.suggestions[0].finishedGoodItemId;
            }
          }
          return next;
        });
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Không lấy được gợi ý"),
    });
  }

  function onSave() {
    setError(null);
    setSavedCount(null);
    const items = pendingNames
      .filter((name) => choices[name])
      .map((name) => ({ posNameRaw: name, finishedGoodItemId: choices[name] }));
    if (items.length === 0) {
      setError("Chưa chọn món cho tên nào");
      return;
    }
    saveMappings.mutate(items, {
      onSuccess: () => {
        setSavedCount(items.length);
        // Bỏ những tên vừa ánh xạ xong khỏi danh sách chờ để còn lại đúng phần chưa xử lý.
        const done = new Set(items.map((it) => it.posNameRaw));
        setPendingText(pendingNames.filter((name) => !done.has(name)).join("\n"));
        setChoices({});
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu ánh xạ thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Ánh xạ món POS</h1>
        <p className="text-sm text-slate-500">
          Tên món trên POS thường khác danh mục Đồ thành phẩm (viết tắt, size, dấu), nên phải khai một lần rồi dùng mãi. Khi
          nhập doanh số mà còn tên chưa ánh xạ, hệ thống <strong>không nhập gì cả</strong> và liệt kê tên ra — dán danh sách
          đó vào đây.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ánh xạ tên đang chờ</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-600">Tên món trên POS — mỗi dòng một tên</label>
          <textarea
            className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            placeholder={"Bạc Xỉu (L)\nCF sữa đá\nTrà vải nhiệt đới"}
            value={pendingText}
            onChange={(e) => setPendingText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={runSuggest} disabled={suggest.isPending || pendingNames.length === 0}>
              <Wand2 size={14} />
              {suggest.isPending ? "Đang tìm..." : `Gợi ý món cho ${pendingNames.length} tên`}
            </Button>
          </div>

          {pendingNames.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Tên trên POS</th>
                    <th className={headClass}>Gợi ý</th>
                    <th className={headClass}>Ánh xạ tới đồ thành phẩm</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingNames.map((name) => {
                    const suggestions = suggestionByName.get(name) ?? [];
                    return (
                      <tr key={name}>
                        <td className={cellClass}>{name}</td>
                        <td className={`${cellClass} text-xs text-slate-500`}>
                          {suggestions.length === 0
                            ? suggest.data
                              ? "Không tìm được món gần giống — chọn tay"
                              : "—"
                            : suggestions.map((s) => `${s.name} (${Math.round(s.score * 100)}%)`).join(", ")}
                        </td>
                        <td className={cellClass}>
                          <Select
                            className="w-64"
                            value={choices[name] ?? ""}
                            onChange={(e) => setChoices((prev) => ({ ...prev, [name]: e.target.value }))}
                          >
                            <option value="">Chọn đồ thành phẩm</option>
                            {finishedGoodOptions.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.code})
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {savedCount !== null && !error && <p className="text-sm text-green-600">Đã lưu {savedCount} ánh xạ.</p>}

          {pendingNames.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={onSave} disabled={saveMappings.isPending}>
                {saveMappings.isPending ? "Đang lưu..." : "Lưu ánh xạ"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ánh xạ đã lưu ({mappings.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : mappings.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có ánh xạ nào.</p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={headClass}>Tên trên POS</th>
                  <th className={headClass}>Khoá tra cứu</th>
                  <th className={headClass}>Đồ thành phẩm</th>
                  <th className={headClass}></th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr key={mapping.id}>
                    <td className={cellClass}>{mapping.posNameRaw}</td>
                    <td className={`${cellClass} font-mono text-xs text-slate-400`}>{mapping.posName}</td>
                    <td className={cellClass}>
                      {mapping.finishedGoodItem.name} ({mapping.finishedGoodItem.code})
                    </td>
                    <td className={cellClass}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteMapping.mutate(mapping.id)}
                        disabled={deleteMapping.isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        Khoá tra cứu là tên đã bỏ dấu và hạ chữ thường. Hai tên POS chỉ khác dấu hoặc hoa thường sẽ trỏ về cùng một ánh xạ.
      </p>
    </div>
  );
}
