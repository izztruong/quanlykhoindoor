"use client";

import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/permissions";
import type { AuthUser } from "@/types";
import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { navSections } from "./nav-config";

/** Bỏ dấu để gõ "phieu nhap" vẫn ra "Phiếu nhập kho". "đ" không tách dấu được nên đổi tay. */
function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d");
}

/**
 * Ô tìm trang ở thanh trên: lọc các mục menu tài khoản được thấy (cùng luật ẩn với Sidebar) rồi
 * nhảy tới. Chỉ tìm tên trang, không tìm dữ liệu — không gọi API nào.
 */
export function PageSearch({ user }: { user: AuthUser }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const pages = useMemo(
    () =>
      navSections.flatMap((section) =>
        section.items
          .filter((item) => hasPermission(user, item.permission))
          .map((item) => ({ ...item, section: section.label, haystack: fold(`${item.label} ${section.label}`) })),
      ),
    [user],
  );

  const results = useMemo(() => {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return pages.filter((page) => terms.every((term) => page.haystack.includes(term))).slice(0, 8);
  }, [pages, query]);

  // Ctrl+K / ⌘K đưa con trỏ vào ô tìm từ bất cứ đâu.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((h) => (results.length ? (h + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (results.length ? (h - 1 + results.length) % results.length : 0));
    } else if (event.key === "Enter" && results[highlight]) {
      event.preventDefault();
      go(results[highlight].href);
    } else if (event.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
    }
  }

  const showDropdown = open && query.trim() !== "";

  return (
    <div className="relative w-full max-w-sm">
      <div className="group flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-slate-400 transition-colors focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/10 hover:border-slate-300">
        <Search size={16} className="shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          // Trễ một nhịp để cú bấm vào kết quả kịp chạy trước khi danh sách bị gỡ.
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Tìm trang..."
          aria-label="Tìm trang"
          className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400 group-focus-within:hidden lg:inline">
          Ctrl K
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-slate-400">Không có trang nào khớp</div>
          ) : (
            results.map((page, index) => (
              <button
                key={page.href}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(page.href)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                  index === highlight ? "bg-indigo-50 text-indigo-700" : "text-slate-700",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{page.label}</span>
                  <span className={cn("block text-xs", index === highlight ? "text-indigo-500" : "text-slate-400")}>
                    {page.section}
                  </span>
                </span>
                {index === highlight && <CornerDownLeft size={14} className="shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
