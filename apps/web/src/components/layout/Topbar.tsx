"use client";

import { useLogout } from "@/lib/auth";
import type { AuthUser } from "@/types";
import { LogOut, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const roleLabel: Record<AuthUser["role"], string> = {
  ADMIN: "Quản trị viên",
  STAFF: "Nhân viên",
};

export function Topbar({ user, onMenuClick }: { user: AuthUser; onMenuClick: () => void }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-slate-400">
        <Search size={16} />
        <input
          placeholder="Tìm kiếm..."
          className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-4">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-slate-50">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-slate-800">{user.name}</div>
            <div className="text-xs text-slate-400">{roleLabel[user.role]}</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
        </Link>
        <button
          type="button"
          title="Đăng xuất"
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
