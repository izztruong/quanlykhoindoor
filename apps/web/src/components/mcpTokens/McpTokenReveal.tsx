"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { pushToast } from "@/lib/toastBus";
import { Copy } from "lucide-react";

interface McpTokenRevealProps {
  token: string;
  endpoint: string;
  onClose: () => void;
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    pushToast("success", `Đã sao chép ${label}`);
  } catch {
    pushToast("error", "Trình duyệt chặn sao chép — bôi đen ô rồi Ctrl+C");
  }
}

/** Hiện token vừa tạo — server chỉ giữ hash, đóng hộp này là không xem lại được nữa. */
export function McpTokenReveal({ token, endpoint, onClose }: McpTokenRevealProps) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
        Token chỉ hiện <b>một lần</b>. Sao chép ngay — đóng hộp này là không xem lại được, mất thì phải tạo token mới.
      </p>

      <CopyField label="Token" value={token} copyLabel="token" />
      <CopyField label="URL connector" value={endpoint} copyLabel="URL" />

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
        <p className="font-medium text-slate-700">Thêm vào Claude trên web</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Vào Settings (Cài đặt) → Connectors → Add custom connector.</li>
          <li>Dán URL connector ở trên.</li>
          <li>Phần xác thực chọn API key / Bearer token, dán token ở trên.</li>
        </ol>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>
          Đã sao chép, đóng
        </Button>
      </div>
    </div>
  );
}

function CopyField({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-slate-600">{label}</label>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
        <Button type="button" variant="secondary" onClick={() => copy(value, copyLabel)} title={`Sao chép ${copyLabel}`}>
          <Copy size={14} />
        </Button>
      </div>
    </div>
  );
}
