"use client";

import { cn } from "@/lib/cn";
import { hasPermission } from "@/lib/permissions";
import type { AuthUser } from "@/types";
import { ChevronDown, Store, X } from "lucide-react";
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

  const isActiveItem = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const hasActiveItem = (section: NavSection) => section.items.some((item) => isActiveItem(item.href));
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
      {open && <div className="fixed inset-0 z-40 bg-slate-900/40 md:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-slate-100 px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Store size={18} />
            </div>
            <span className="text-lg font-semibold text-slate-800">Quản lý kho</span>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 md:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {visibleSections.map((section) => {
            const sectionOpen = isOpen(section);
            return (
              <div key={section.label}>
                <button
                  type="button"
                  onClick={() => toggleSection(section)}
                  aria-expanded={sectionOpen}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-slate-50",
                    hasActiveItem(section) ? "text-slate-600" : "text-slate-400",
                  )}
                >
                  <section.icon size={14} />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown size={14} className={cn("transition-transform", sectionOpen && "rotate-180")} />
                </button>

                {sectionOpen && (
                  <div className="space-y-0.5 pb-2">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50",
                          isActiveItem(item.href) && "bg-indigo-50 text-indigo-700",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
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
