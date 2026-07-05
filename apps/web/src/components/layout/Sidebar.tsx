"use client";

import { cn } from "@/lib/cn";
import type { AuthUser } from "@/types";
import { Store, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { navSections } from "./nav-config";

interface SidebarProps {
  user: AuthUser;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ user, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const visibleSections = navSections.filter((section) => !section.adminOnly || user.role === "ADMIN");

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

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {visibleSections.map((section) => (
            <div key={section.label}>
              <div className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <section.icon size={14} />
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50",
                        active && "bg-indigo-50 text-indigo-700",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
