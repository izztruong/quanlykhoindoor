"use client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { IGNORE_MAPPING, useSavePosItemMappings } from "@/hooks/usePosSales";
import { ApiError } from "@/lib/api-client";
import type { PosMappingSuggestion } from "@/types";
import { useMemo, useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

interface Props {
  /** Tên POS cần ánh xạ. Trang Ánh xạ truyền danh sách người dùng dán vào; hộp thoại nhập truyền
   *  thẳng `unmappedNames` server vừa trả về. */
  posNames: string[];
  /** Gợi ý do phía gọi lấy về. Để trống thì bảng vẫn dùng được, chỉ là phải chọn tay. */
  suggestions?: PosMappingSuggestion[];
  suggesting?: boolean;
  saveLabel: string;
  onSaved: (savedNames: string[]) => void;
}

/**
 * Bảng ánh xạ tên POS → đồ thành phẩm. Dùng chung cho trang Ánh xạ món POS và hộp thoại nhập doanh số
 * — một bản logic duy nhất, nên hai chỗ không thể lệch nhau về cách lưu hay về lựa chọn "bỏ qua".
 *
 * Gợi ý do phía gọi truyền vào chứ component không tự đi lấy: mỗi nơi kích hoạt bằng một sự kiện khác
 * nhau (bấm nút / nhập file xong), và lấy trong `useEffect` sẽ là setState trong effect — gây render
 * lồng, và là lỗi lint của dự án này.
 */
export function PosMappingEditor({ posNames, suggestions, suggesting = false, saveLabel, onSaved }: Props) {
  const { data: finishedGoods = [] } = useFinishedGoodItems();
  const saveMappings = useSavePosItemMappings();

  // Chỉ giữ lựa chọn người dùng ĐÃ tự bấm. Ô chưa bấm thì lấy gợi ý tốt nhất ngay lúc render, không
  // lưu vào state — nhờ vậy gợi ý về muộn vẫn hiện đúng mà không cần đồng bộ state theo props.
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const suggestionByName = useMemo(
    () => new Map((suggestions ?? []).map((s) => [s.posNameRaw, s.suggestions])),
    [suggestions],
  );

  /** Lựa chọn đang hiển thị: người bấm gì dùng nấy, chưa bấm thì gợi ý tốt nhất, không có thì để trống. */
  function choiceFor(name: string): string {
    return picked[name] ?? suggestionByName.get(name)?.[0]?.finishedGoodItemId ?? "";
  }

  const chosenCount = posNames.filter((name) => choiceFor(name) !== "").length;

  function onSave() {
    setError(null);
    const items = posNames
      .map((name) => ({ name, choice: choiceFor(name) }))
      .filter((it) => it.choice !== "")
      .map((it) => ({
        posNameRaw: it.name,
        finishedGoodItemId: it.choice === IGNORE_MAPPING ? null : it.choice,
      }));
    if (items.length === 0) {
      setError("Chưa chọn gì cho tên nào");
      return;
    }
    saveMappings.mutate(items, {
      onSuccess: () => {
        const saved = items.map((it) => it.posNameRaw);
        setPicked({});
        onSaved(saved);
      },
      onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu ánh xạ thất bại"),
    });
  }

  if (posNames.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {suggesting && <p className="text-sm text-slate-400">Đang tìm món gần giống...</p>}

      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className={headClass}>Tên trên POS</th>
              <th className={headClass}>Gợi ý</th>
              <th className={headClass}>Ánh xạ tới</th>
            </tr>
          </thead>
          <tbody>
            {posNames.map((name) => {
              const rowSuggestions = suggestionByName.get(name) ?? [];
              return (
                <tr key={name}>
                  <td className={cellClass}>{name}</td>
                  <td className={`${cellClass} text-xs text-slate-500`}>
                    {rowSuggestions.length === 0
                      ? suggestions
                        ? "Không tìm được món gần giống"
                        : "—"
                      : rowSuggestions.map((s) => `${s.name} (${Math.round(s.score * 100)}%)`).join(", ")}
                  </td>
                  <td className={cellClass}>
                    <Select
                      className="w-64"
                      value={choiceFor(name)}
                      onChange={(e) => setPicked((prev) => ({ ...prev, [name]: e.target.value }))}
                    >
                      <option value="">Chọn đồ thành phẩm</option>
                      {/* Dòng không phải món (phí ship, voucher, combo…) — không khai bỏ qua thì chúng
                          chặn phần nhập vĩnh viễn, vì không tên nào được phép còn thiếu ánh xạ. */}
                      <option value={IGNORE_MAPPING}>— Bỏ qua tên này (không phải món) —</option>
                      {finishedGoods.map((item) => (
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">
          Đã chọn {chosenCount}/{posNames.length}
          {chosenCount < posNames.length && " — tên chưa chọn sẽ vẫn chặn phần nhập"}
        </span>
        <Button onClick={onSave} disabled={saveMappings.isPending || chosenCount === 0}>
          {saveMappings.isPending ? "Đang lưu..." : saveLabel}
        </Button>
      </div>
    </div>
  );
}
