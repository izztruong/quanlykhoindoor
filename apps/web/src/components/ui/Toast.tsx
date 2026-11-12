"use client";

import { subscribeToasts, type ToastMessage } from "@/lib/toastBus";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 bottom-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => {
        const success = toast.type === "success";
        return (
          <div
            key={toast.id}
            role={success ? "status" : "alert"}
            className={`flex animate-slide-in items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg shadow-slate-900/10 ${
              success ? "border-emerald-200" : "border-red-200"
            }`}
          >
            <span
              className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                success ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
              }`}
            >
              {success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            </span>
            <span className="min-w-0 flex-1 break-words">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
