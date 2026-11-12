"use client";

import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/api-client";
import { useGoogleLogin, useLogin } from "@/lib/auth";
import { ChartColumn, ClipboardList, Store, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const googleLogin = useGoogleLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate(
      { email, password },
      {
        // Trang chủ mở được với mọi tài khoản (từng ô tự ẩn theo quyền) nên luôn vào đó.
        onSuccess: () => router.replace("/"),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Đăng nhập thất bại"),
      },
    );
  }

  function handleGoogleCredential(credential: string) {
    setError(null);
    googleLogin.mutate(credential, {
      onSuccess: () => router.replace("/"),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Đăng nhập bằng Google thất bại"),
    });
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_1fr]">
      {/* Khối thương hiệu — chỉ hiện trên màn rộng, điện thoại vào thẳng form. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/50">
            <Store size={20} />
          </div>
          <span className="text-lg font-semibold tracking-tight">Quản lý kho</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">
            Kho của cả chuỗi quán,{" "}
            <span className="bg-linear-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">gọn trong một nơi.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-slate-300">
            {[
              { icon: Warehouse, text: "Nhập kho, điều chuyển giữa các quán" },
              { icon: ClipboardList, text: "Kiểm kê quán và phiếu huỷ nguyên liệu" },
              { icon: ChartColumn, text: "Check Cost — chi phí nguyên vật liệu theo kỳ" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-200 ring-1 ring-white/10">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-slate-500">© {new Date().getFullYear()} Quản lý kho</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30 lg:hidden">
              <Store size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Đăng nhập</h1>
              <p className="mt-1 text-sm text-slate-500">Chào mừng trở lại! Nhập thông tin tài khoản để tiếp tục.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                  Mật khẩu
                </label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={login.isPending} className="mt-2 h-11 w-full">
                {login.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </form>

            {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" />
                  hoặc
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <GoogleLoginButton onCredential={handleGoogleCredential} />
                {googleLogin.isPending && <p className="mt-2 text-center text-sm text-slate-400">Đang đăng nhập...</p>}
              </>
            )}
          </div>

          <Link
            href="/privacy-policy"
            className="mt-6 block text-center text-sm text-slate-500 underline-offset-4 hover:text-indigo-700 hover:underline"
          >
            Chính sách quyền riêng tư
          </Link>
        </div>
      </main>
    </div>
  );
}
