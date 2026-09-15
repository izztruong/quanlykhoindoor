"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { requiredPermissionFor } from "@/components/layout/nav-config";
import { Card, CardBody } from "@/components/ui/Card";
import { useCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
    return <div className="flex h-screen items-center justify-center text-slate-400">Đang tải...</div>;
  }

  // Chặn trang tập trung theo nav-config thay vì mỗi trang tự kiểm. Chỉ là hiển thị — API vẫn tự
  // chặn bằng requirePermission, gõ thẳng URL hay gọi API cũng không qua được.
  const required = requiredPermissionFor(pathname);
  const allowed = !required || hasPermission(user, required);

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar user={user} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          {allowed ? (
            children
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
