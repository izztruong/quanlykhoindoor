"use client";

import { ChangePasswordForm } from "@/components/layout/ChangePasswordForm";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/types";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const roleLabel: Record<AuthUser["role"], string> = {
  ADMIN: "Quản trị viên",
  STAFF: "Nhân viên",
};

export default function ProfilePage() {
  const { data: user, isLoading } = useCurrentUser();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  if (isLoading || !user) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Thông tin tài khoản</h1>
        <p className="text-sm text-slate-500">Thông tin cá nhân và thay đổi mật khẩu đăng nhập.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-xl font-semibold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-base font-semibold text-slate-800">{user.name}</div>
              <Badge tone={user.role === "ADMIN" ? "blue" : "gray"}>{roleLabel[user.role]}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-400">Email</div>
              <div className="text-slate-700">{user.email}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Mật khẩu</div>
              <div className="tracking-widest text-slate-700">••••••••</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setChangePasswordOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4"
        >
          <CardTitle>Đổi mật khẩu</CardTitle>
          <ChevronDown
            size={18}
            className={`text-slate-400 transition-transform ${changePasswordOpen ? "rotate-180" : ""}`}
          />
        </button>
        {changePasswordOpen && (
          <CardBody className="border-t border-slate-100">
            <ChangePasswordForm />
          </CardBody>
        )}
      </Card>
    </div>
  );
}
