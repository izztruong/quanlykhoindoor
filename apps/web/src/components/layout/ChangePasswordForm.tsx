"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api-client";
import { useChangePassword } from "@/lib/auth";
import { FormEvent, useState } from "react";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const changePassword = useChangePassword();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới nhập lại không khớp");
      return;
    }

    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setSuccess(true);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Đổi mật khẩu thất bại"),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Mật khẩu hiện tại</label>
        <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Mật khẩu mới</label>
        <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Nhập lại mật khẩu mới</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={6}
          required
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Đổi mật khẩu thành công.</p>}

      <div className="mt-1">
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Đang lưu..." : "Đổi mật khẩu"}
        </Button>
      </div>
    </form>
  );
}
