"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { requiredPermissionFor } from "@/components/layout/nav-config";
import { Card, CardBody } from "@/components/ui/Card";
import { useCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Store } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError } = useCurrentUser();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && (isError || !user)) {
      router.replace("/login");
    }
  }, [isLoading, isError, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-sm text-slate-400">
        <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
          <Store size={22} />
        </div>
        Đang tải...
      </div>
    );
  }

  // Chặn trang tập trung theo nav-config thay vì mỗi trang tự kiểm. Chỉ là hiển thị — API vẫn tự
  // chặn bằng requirePermission, gõ thẳng URL hay gọi API cũng không qua được.
  const required = requiredPermissionFor(pathname);
  const allowed = !required || hasPermission(user, required);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar user={user} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuClick={() => setMobileNavOpen(true)} />
        {/* Đổi padding ở đây thì sửa cả phần bù âm ở DashboardClient (nền trời tràn sát mép). */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {allowed ? (
            // Trang danh sách đọc useSearchParams (hooks/useListUrlState) — Next bắt buộc có Suspense
            // bao quanh khi build, thiếu là `next build` lỗi dù dev vẫn chạy.
            <Suspense fallback={<div className="py-10 text-center text-sm text-slate-400">Đang tải...</div>}>{children}</Suspense>
          ) : (
            <Card>
              <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
