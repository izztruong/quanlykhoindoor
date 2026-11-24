"use client";

import { cn } from "@/lib/cn";
import { fold, matchesAllTerms } from "@/lib/textSearch";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export interface SearchSelectOption {
  value: string;
  label: string;
  /** Dòng phụ in nhỏ dưới nhãn (vd ĐVT). Không dùng để tìm. */
  sublabel?: string;
  /** Chữ thêm vào để tìm mà không hiện ra (vd mã hàng khi nhãn chưa chứa mã). */
  keywords?: string;
}

interface Props {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  emptyText?: string;
}

/**
 * Hiện tối đa bấy nhiêu dòng: danh mục hàng hoá vài trăm dòng, vẽ hết thì danh sách dài vô ích mà
 * mỗi phím gõ lại phải vẽ lại cả trăm nút. Muốn hàng nằm sâu hơn thì gõ thêm chữ.
 */
const MAX_RESULTS = 50;

/**
 * Ô chọn gõ được để tìm — thay `<select>` gốc ở chỗ danh sách dài, vì `<select>` chỉ nhảy theo chữ
 * cái đầu của nhãn. Tìm không phân biệt dấu và theo từng từ ("sua dac" ra "Sữa đặc có đường").
 *
 * Khi không mở, ô hiện nhãn của giá trị đang chọn. Bấm vào thì ô trống chữ (nhãn cũ chuyển thành
 * placeholder) để gõ ngay; bỏ ra mà không chọn gì thì giá trị **giữ nguyên**.
 */
export function SearchSelect({ options, value, onChange, placeholder, invalid, disabled, emptyText = "Không có kết quả khớp" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const indexed = useMemo(
    () => options.map((option) => ({ ...option, haystack: fold(`${option.label} ${option.keywords ?? ""}`) })),
    [options],
  );
  const matched = useMemo(
    () => (query.trim() ? indexed.filter((option) => matchesAllTerms(option.haystack, query)) : indexed),
    [indexed, query],
  );
  const results = matched.slice(0, MAX_RESULTS);
  const selected = options.find((option) => option.value === value);

  // Dùng phím ↑/↓ thì dòng đang chọn phải luôn nằm trong khung cuộn.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[highlight] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function openList() {
    setQuery("");
    // Mở ra thì đứng sẵn ở dòng đang chọn, để Enter ngay không đổi gì.
    const current = indexed.findIndex((option) => option.value === value);
    setHighlight(current >= 0 && current < MAX_RESULTS ? current : 0);
    setOpen(true);
  }

  function pick(option: SearchSelectOption) {
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openList();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (results.length ? (h + step + results.length) % results.length : 0));
    } else if (event.key === "Enter") {
      // Đang mở danh sách thì Enter là CHỌN — không được để nó submit form chứa ô này.
      if (!open) return;
      event.preventDefault();
      if (results[highlight]) pick(results[highlight]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        placeholder={open && selected ? selected.label : placeholder}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          "h-10 w-full rounded-lg border bg-white pr-9 pl-3 text-sm text-slate-800 shadow-xs transition-colors placeholder:text-slate-400",
          "hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          invalid ? "border-red-300" : "border-slate-200",
        )}
      />
      <ChevronDown size={16} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-slate-400">{emptyText}</div>
          ) : (
            <div ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
              {results.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  tabIndex={-1}
                  // Chặn mousedown để ô input không mất focus (và đóng danh sách) trước khi click kịp chạy.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    "flex w-full flex-col rounded-md px-3 py-1.5 text-left text-sm",
                    index === highlight ? "bg-indigo-50 text-indigo-700" : "text-slate-700",
                    option.value === value && "font-semibold",
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {option.sublabel && (
                    <span className={cn("text-xs", index === highlight ? "text-indigo-500" : "text-slate-400")}>{option.sublabel}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {matched.length > MAX_RESULTS && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              Còn {matched.length - MAX_RESULTS} kết quả nữa — gõ thêm để thu hẹp.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
