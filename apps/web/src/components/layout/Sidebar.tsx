"use client";

import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/permissions";
import type { AuthUser } from "@/types";
import { ChevronDown, Home, Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { navSections, type NavSection } from "./nav-config";

interface SidebarProps {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ user, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  // Ẩn từng mục thiếu quyền, rồi ẩn luôn nhóm không còn mục nào.
  const visibleSections = navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => hasPermission(user, item.permission)) }))
    .filter((section) => section.items.length > 0);

  // Nhóm nào chứa trang đang xem thì mở, bấm vào tiêu đề thì ghi đè, và mỗi lần đổi route thì
  // xoá hết ghi đè để nhóm của trang mới luôn hiện ra — nếu không, một nhóm đã thu tay sẽ giấu
  // mất chính mục vừa điều hướng tới. Cố tình so sánh lastPath ngay trong thân component chứ
  // không dùng useEffect: repo bật rule react-hooks/set-state-in-effect, và đây đúng là mẫu
  // React khuyến nghị để chỉnh state theo giá trị thay đổi.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOverrides({});
  }

  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  // Chỉ tô MỘT mục: mục có href là tiền tố dài nhất. Không thì đang ở /orders/new cả "Danh sách đơn
  // hàng" (/orders) lẫn "Tạo đơn hàng" cùng sáng.
  const activeHref = visibleSections
    .flatMap((section) => section.items)
    .filter((item) => matches(item.href))
    .reduce<string | null>((best, item) => (!best || item.href.length > best.length ? item.href : best), null);

  const hasActiveItem = (section: NavSection) => section.items.some((item) => matches(item.href));
  const isOpen = (section: NavSection) => overrides[section.label] ?? hasActiveItem(section);

  function toggleSection(section: NavSection) {
    setOverrides((prev) => ({ ...prev, [section.label]: !isOpen(section) }));
  }

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 animate-fade-in bg-slate-900/50 backdrop-blur-[2px] md:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col bg-slate-900 text-slate-300 transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
              <Store size={18} />
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-white">Quản lý kho</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pt-2 pb-6 [scrollbar-color:#334155_transparent]">
          {/* Đứng ngoài navSections: trang chủ không cần quyền, và nav-config còn dùng để chặn trang. */}
          <Link
            href="/"
            className={cn(
              "mb-3 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname === "/" ? "bg-indigo-500/15 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white",
            )}
          >
            <Home size={16} className={pathname === "/" ? "text-indigo-300" : "text-slate-400"} />
            Trang chủ
          </Link>

          {visibleSections.map((section) => {
            const sectionOpen = isOpen(section);
            const sectionActive = hasActiveItem(section);
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  aria-expanded={sectionOpen}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-semibold tracking-wider uppercase transition-colors hover:bg-white/5",
                    sectionActive ? "text-slate-200" : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  <section.icon size={15} className={sectionActive ? "text-indigo-300" : undefined} />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown size={14} className={cn("transition-transform duration-200", sectionOpen && "rotate-180")} />
                </button>

                {sectionOpen && (
                  <div className="relative mt-0.5 mb-2 ml-[19px] space-y-0.5 border-l border-slate-700/70 pl-3">
                    {section.items.map((item) => {
                      const active = item.href === activeHref;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative block rounded-lg px-3 py-1.5 text-[13.5px] transition-colors",
                            active
                              ? "bg-indigo-500/15 font-medium text-white before:absolute before:top-1/2 before:-left-[13px] before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-indigo-400"
                              : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
