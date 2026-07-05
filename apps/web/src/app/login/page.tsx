"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api-client";
import { useLogin } from "@/lib/auth";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("admin@quanly.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        onSuccess: (user) => router.replace(user.role === "ADMIN" ? "/audit/inventory-count" : "/orders"),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Đăng nhập thất bại"),
      },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Store size={24} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Quản lý kho</h1>
          <p className="text-sm text-slate-400">Đăng nhập để tiếp tục</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Mật khẩu</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" disabled={login.isPending} className="mt-2 w-full">
            {login.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>
      </div>
    </div>
  );
}
