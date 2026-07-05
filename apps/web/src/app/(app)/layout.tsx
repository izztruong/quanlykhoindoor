"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useCurrentUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace("/login");
    }
  }, [isLoading, isError, user, router]);

  if (isLoading || !user) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Đang tải...</div>;
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar user={user} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
