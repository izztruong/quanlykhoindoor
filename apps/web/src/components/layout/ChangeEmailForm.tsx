"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api-client";
import { useChangeEmail } from "@/lib/auth";
import { FormEvent, useState } from "react";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const changeEmail = useChangeEmail();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    changeEmail.mutate(
      { email, currentPassword },
      {
        onSuccess: (user) => {
          setSuccess(true);
          setEmail(user.email);
          setCurrentPassword("");
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Đổi email thất bại"),
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Email mới</label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <p className="text-xs text-slate-400">
          Dùng Gmail để đăng nhập được bằng nút Google. Email mới cũng là email đăng nhập bằng mật khẩu.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Mật khẩu hiện tại</label>
        <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Đổi email thành công.</p>}

      <div className="mt-1">
        <Button type="submit" disabled={changeEmail.isPending}>
          {changeEmail.isPending ? "Đang lưu..." : "Đổi email"}
        </Button>
      </div>
    </form>
  );
}
