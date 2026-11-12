"use client";

import { useLogout } from "@/lib/auth";
import type { AuthUser } from "@/types";
import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageSearch } from "./PageSearch";

export function Topbar({ user, onMenuClick }: { user: AuthUser; onMenuClick: () => void }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur md:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Mở menu"
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
      >
        <Menu size={20} />
      </button>

      <PageSearch user={user} />

      <div className="flex items-center gap-1">
        <Link href="/profile" className="flex items-center gap-3 rounded-xl py-1 pr-2 pl-1 transition-colors hover:bg-slate-100 sm:pl-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm leading-tight font-semibold text-slate-800">{user.name}</div>
            <div className="text-xs leading-tight text-slate-400">{user.roleName}</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white ring-2 ring-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        </Link>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <button
          type="button"
          title="Đăng xuất"
          aria-label="Đăng xuất"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
