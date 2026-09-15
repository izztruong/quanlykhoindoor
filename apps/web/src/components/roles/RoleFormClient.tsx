"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useCreateRole, useUpdateRole } from "@/hooks/useRoles";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import type { AuthUser, PermissionAction, PermissionCatalog, Role } from "@/types";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type PermissionResource = PermissionCatalog["resources"][number];

interface RoleFormClientProps {
  catalog: PermissionCatalog;
  currentUser: AuthUser;
  /** Bỏ trống = tạo vai trò mới. */
  existing?: Role;
  onDone: () => void;
}

/**
 * Danh sách quyền: mỗi trang một dòng, bấm vào chữ tóm tắt để mở menu các hành động của riêng trang
 * đó. Không dùng bảng cột cố định nên thêm hành động mới ở server (permissions.ts) là giao diện tự
 * hiện, không phải thêm cột. Ô người đang sửa không nắm thì khoá lại — server cũng từ chối cấp hoặc
 * gỡ những mã đó, khoá ở đây chỉ để khỏi bấm rồi mới nhận lỗi.
 */
export function RoleFormClient({ catalog, currentUser, existing, onDone }: RoleFormClientProps) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const [name, setName] = useState(existing?.name ?? "");
  const [isShop, setIsShop] = useState(existing?.isShop ?? false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(existing?.permissions ?? []));
  const [openResource, setOpenResource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEditable = (code: string) => currentUser.isSystem || currentUser.permissions.includes(code);
  const pending = createRole.isPending || updateRole.isPending;

  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionResource[]>();
    for (const resource of catalog.resources) {
      byGroup.set(resource.group, [...(byGroup.get(resource.group) ?? []), resource]);
    }
    return Array.from(byGroup.entries());
  }, [catalog]);

  function update(mutator: (next: Set<string>) => void) {
    setSelected((prev) => {
      const next = new Set(prev);
      mutator(next);
      return next;
    });
  }

  /**
   * Tick một hành động bất kỳ thì tự tick luôn "Xem" của trang đó (không xem được trang thì không
   * bấm được nút); bỏ "Xem" thì bỏ luôn các hành động còn lại của trang.
   */
  function toggle(resource: PermissionResource, action: PermissionAction, checked: boolean) {
    const code = `${resource.resource}.${action}`;
    update((next) => {
      if (checked) {
        next.add(code);
        const viewCode = `${resource.resource}.VIEW`;
        if (action !== "VIEW" && resource.actions.includes("VIEW") && isEditable(viewCode)) next.add(viewCode);
      } else {
        next.delete(code);
        if (action === "VIEW") {
          for (const other of resource.actions) {
            if (isEditable(`${resource.resource}.${other}`)) next.delete(`${resource.resource}.${other}`);
          }
        }
      }
    });
  }

  function setRow(resource: PermissionResource, checked: boolean) {
    update((next) => {
      for (const action of resource.actions) {
        const code = `${resource.resource}.${action}`;
        if (!isEditable(code)) continue;
        if (checked) next.add(code);
        else next.delete(code);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = { name: name.trim(), isShop, permissions: Array.from(selected) };
    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Lưu vai trò thất bại");
    if (existing) updateRole.mutate({ id: existing.id, ...payload }, { onSuccess: onDone, onError });
    else createRole.mutate(payload, { onSuccess: onDone, onError });
  }

  const scopeCode = catalog.scopeAll.code;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 md:w-80">
        <label className="text-sm font-medium text-slate-600">Tên vai trò</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Kế toán" required />
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={isShop} onChange={(e) => setIsShop(e.target.checked)} />
        <span>
          <span className="font-medium text-slate-700">Tài khoản thuộc vai trò này là quán</span>
          <span className="block text-xs text-slate-500">
            Chỉ tài khoản là quán mới hiện trong các ô chọn/lọc quán (đơn hàng, điều chuyển, Check Cost…). Bỏ tick với vai trò
            chỉ dùng một chức năng, vd tài khoản chỉ lập phiếu đề xuất chi.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={selected.has(scopeCode)}
          disabled={!isEditable(scopeCode)}
          onChange={(e) => {
            const checked = e.target.checked;
            update((next) => {
              if (checked) next.add(scopeCode);
              else next.delete(scopeCode);
            });
          }}
        />
        <span>
          <span className="font-medium text-slate-700">{catalog.scopeAll.label}</span>
          <span className="block text-xs text-slate-500">
            Không tick thì đơn hàng, phiếu kiểm, phiếu huỷ, chi chốt ca chỉ thấy và thao tác được dữ liệu do chính tài khoản đó
            tạo.
          </span>
        </span>
      </label>

      <div>
        <div className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Phân quyền</div>
        {groups.map(([group, resources]) => (
          <div key={group}>
            <div className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</div>
            {resources.map((resource) => (
              <div
                key={resource.resource}
                className="flex flex-col gap-2 border-b border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-slate-700">{resource.label}</span>
                <PermissionPicker
                  resource={resource}
                  actionLabels={catalog.actionLabels}
                  selected={selected}
                  isEditable={isEditable}
                  open={openResource === resource.resource}
                  onOpenChange={(open) => setOpenResource(open ? resource.resource : null)}
                  onToggle={(action, checked) => toggle(resource, action, checked)}
                  onRow={(checked) => setRow(resource, checked)}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu vai trò"}
        </Button>
      </div>
    </form>
  );
}

interface PermissionPickerProps {
  resource: PermissionResource;
  actionLabels: PermissionCatalog["actionLabels"];
  selected: Set<string>;
  isEditable: (code: string) => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (action: PermissionAction, checked: boolean) => void;
  onRow: (checked: boolean) => void;
}

function PermissionPicker({ resource, actionLabels, selected, isEditable, open, onOpenChange, onToggle, onRow }: PermissionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Cùng mẫu đóng-khi-bấm-ra-ngoài với menu Excel ở SimpleCodeNameExcelActions.
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, onOpenChange]);

  const granted = resource.actions.filter((action) => selected.has(`${resource.resource}.${action}`));
  const all = granted.length === resource.actions.length;
  const some = granted.length > 0 && !all;
  const summary = granted.length === 0 ? "Không có quyền" : all ? "Toàn quyền" : granted.map((a) => actionLabels[a]).join(", ");

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 sm:w-64">
      <input
        type="checkbox"
        className="h-4 w-4"
        title="Chọn / bỏ cả dòng"
        checked={all}
        ref={(el) => {
          if (el) el.indeterminate = some;
        }}
        onChange={() => onRow(!all)}
      />
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1 rounded px-1 text-left text-sm hover:text-indigo-600",
          granted.length === 0 ? "text-slate-500" : "text-slate-700",
        )}
      >
        {summary}
        <ChevronDown size={14} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex min-w-48 flex-col gap-1 rounded-xl border border-slate-100 bg-white p-2 shadow-lg">
          {resource.actions.map((action) => {
            const code = `${resource.resource}.${action}`;
            const editable = isEditable(code);
            return (
              <label
                key={action}
                title={editable ? undefined : "Bạn không có quyền này nên không cấp/gỡ được"}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700",
                  editable ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(code)}
                  disabled={!editable}
                  onChange={(e) => onToggle(action, e.target.checked)}
                />
                {actionLabels[action]}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
