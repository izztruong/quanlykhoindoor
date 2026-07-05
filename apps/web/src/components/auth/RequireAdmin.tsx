"use client";

import { Card, CardBody } from "@/components/ui/Card";
import { useCurrentUser } from "@/lib/auth";

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading) return null;

  if (user && user.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  return <>{children}</>;
}
