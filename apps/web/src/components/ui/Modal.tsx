"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "xl" cho nội dung dạng bảng rộng (vd bảng tick quyền). */
  size?: "md" | "lg" | "xl";
}

export function Modal({ title, onClose, children, size = "md" }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/50 px-4 py-8 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-full w-full animate-pop-in flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 ${size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-lg"}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
