"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreateMcpToken, useUpdateMcpToken } from "@/hooks/useMcpTokens";
import { ApiError } from "@/lib/api-client";
import type { CreatedMcpToken, McpToken, McpToolInfo } from "@/types";
import { useState } from "react";

interface McpTokenFormClientProps {
  tools: McpToolInfo[];
  /** Bỏ trống = tạo token mới. */
  existing?: McpToken;
  onCreated: (created: CreatedMcpToken) => void;
  onDone: () => void;
}

/**
 * Tên + danh sách tool được dùng. Danh sách đọc từ server nên thêm tool ở server là ô tick tự hiện —
 * nhưng token đã có không tự được tick tool mới, phải mở ra tick thêm.
 */
export function McpTokenFormClient({ tools, existing, onCreated, onDone }: McpTokenFormClientProps) {
  const createToken = useCreateMcpToken();
  const updateToken = useUpdateMcpToken();
  const [name, setName] = useState(existing?.name ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(existing?.tools ?? []));
  const [error, setError] = useState<string | null>(null);
  const pending = createToken.isPending || updateToken.isPending;

  function toggle(toolName: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(toolName);
      else next.delete(toolName);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Giữ thứ tự của danh mục thay vì thứ tự bấm, để danh sách lưu ra dễ đọc.
    const payload = { name: name.trim(), tools: tools.map((t) => t.name).filter((n) => selected.has(n)) };
    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Lưu token thất bại");
    if (existing) updateToken.mutate({ id: existing.id, ...payload }, { onSuccess: onDone, onError });
    else createToken.mutate(payload, { onSuccess: onCreated, onError });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:w-80">
        <label className="text-sm font-medium text-slate-600">Tên token</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Claude — báo cáo chi phí" required />
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Tool được dùng ({selected.size}/{tools.length})
          </span>
          <span className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set(tools.map((t) => t.name)))}>
              Chọn tất cả
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSelected(new Set())}>
              Bỏ hết
            </Button>
          </span>
        </div>
        {tools.map((tool) => (
          <label key={tool.name} className="flex items-start gap-3 border-b border-slate-100 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.has(tool.name)}
              onChange={(e) => toggle(tool.name, e.target.checked)}
            />
            <span className="min-w-0">
              <span className="font-medium text-slate-700">{tool.title}</span>
              <code className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{tool.name}</code>
              <span className="mt-1 block text-xs text-slate-500">{tool.description}</span>
            </span>
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : existing ? "Lưu token" : "Tạo token"}
        </Button>
      </div>
    </form>
  );
}
