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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className={`flex max-h-full w-full flex-col rounded-xl bg-white shadow-lg ${size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
