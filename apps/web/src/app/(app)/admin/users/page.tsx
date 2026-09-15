"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useRoleOptions, type RoleOption } from "@/hooks/useRoles";
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers, type ManagedUser } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { AuthUser } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

/** Cùng luật với server (users.routes.ts): chỉ gán được vai trò có quyền nằm gọn trong quyền của mình. */
function isAssignable(role: RoleOption, actor: AuthUser | null | undefined) {
  if (!actor) return false;
  if (actor.isSystem) return true;
  return !role.isSystem && role.permissions.every((code) => actor.permissions.includes(code));
}

export default function UsersPage() {
  const { user: currentUser, can } = useCan();
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoleOptions();
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(users);
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const [form, setForm] = useState({ email: "", password: "", name: "", roleId: "" });
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedUser | null>(null);

  const canAdd = can("USERS", "ADD");
  const canEdit = can("USERS", "EDIT");
  const canDelete = can("USERS", "DELETE");
  const systemCount = users.filter((u) => u.role.isSystem).length;
  const assignableRoles = roles.filter((role) => isAssignable(role, currentUser));
  // Mặc định chọn vai trò không phải hệ thống đầu tiên (thường là "Quán") cho khỏi lỡ tay tạo admin.
  const defaultRoleId = assignableRoles.find((role) => !role.isSystem)?.id ?? assignableRoles[0]?.id ?? "";
  const formRoleId = form.roleId || defaultRoleId;

  const columns = useMemo<ColumnDef<ManagedUser>[]>(
    () => [
      { header: "Tên", accessorKey: "name" },
      { header: "Email", accessorKey: "email" },
      {
        header: "Vai trò",
        id: "role",
        cell: ({ row }) => <Badge tone={row.original.role.isSystem ? "blue" : "gray"}>{row.original.role.name}</Badge>,
      },
      { header: "Ngày tạo", accessorFn: (row) => formatDateTime(row.createdAt), id: "createdAt" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => {
          const isSelf = row.original.id === currentUser?.id;
          const isLastAdmin = row.original.role.isSystem && systemCount <= 1;
          const disabled = isSelf || isLastAdmin || deleteUser.isPending;
          const title = isSelf
            ? "Không thể tự xoá tài khoản của chính mình"
            : isLastAdmin
              ? "Không thể xoá quản trị viên cuối cùng"
              : "Xoá tài khoản";
          return (
            <span className="flex items-center justify-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  title="Sửa tài khoản"
                  onClick={() => setEditing(row.original)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={disabled}
                  title={title}
                  onClick={() => {
                    setDeleteError(null);
                    if (confirm(`Xoá tài khoản ${row.original.email}?`)) {
                      deleteUser.mutate(row.original.id, {
                        onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Xoá tài khoản thất bại"),
                      });
                    }
                  }}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          );
        },
      },
    ],
    [currentUser?.id, deleteUser, systemCount, canEdit, canDelete],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(
      { ...form, roleId: formRoleId },
      {
        onSuccess: () => setForm({ email: "", password: "", name: "", roleId: "" }),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Tạo tài khoản thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Quản lý tài khoản</h1>
        <p className="text-sm text-slate-500">
          Tạo, sửa hoặc xoá tài khoản đăng nhập. Quyền của từng vai trò chỉnh ở trang Vai trò & phân quyền.
        </p>
      </div>

      {canAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Tạo tài khoản mới</CardTitle>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-5 md:items-end">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Họ tên</label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Email</label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Mật khẩu</label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  minLength={6}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Vai trò</label>
                <Select value={formRoleId} onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))} required>
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={createUser.isPending || !formRoleId}>
                <UserPlus size={16} />
                Tạo tài khoản
              </Button>
            </form>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách tài khoản</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={pageItems} isLoading={isLoading} />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
        {deleteError && <p className="px-4 pb-4 text-sm text-red-600">{deleteError}</p>}
      </Card>

      {editing && (
        <Modal title={`Sửa tài khoản: ${editing.email}`} onClose={() => setEditing(null)}>
          <EditUserForm
            user={editing}
            roles={roles}
            actor={currentUser}
            isLastAdmin={editing.role.isSystem && systemCount <= 1}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

interface EditUserFormProps {
  user: ManagedUser;
  roles: RoleOption[];
  actor: AuthUser | null | undefined;
  isLastAdmin: boolean;
  onDone: () => void;
}

function EditUserForm({ user, roles, actor, isLastAdmin, onDone }: EditUserFormProps) {
  const updateUser = useUpdateUser();
  const [name, setName] = useState(user.name);
  const [roleId, setRoleId] = useState(user.role.id);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === actor?.id;
  // Vai trò đang giữ luôn nằm trong danh sách để ô chọn không tự nhảy sang vai trò khác.
  const selectableRoles = roles.filter((role) => role.id === user.role.id || isAssignable(role, actor));
  const roleLocked = isSelf || isLastAdmin;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateUser.mutate(
      { id: user.id, name, roleId, password },
      { onSuccess: onDone, onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu tài khoản thất bại") },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Họ tên</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Vai trò</label>
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={roleLocked}>
          {selectableRoles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        {roleLocked && (
          <p className="text-xs text-slate-400">
            {isSelf ? "Không thể tự đổi vai trò của chính mình." : "Đây là quản trị viên cuối cùng, không hạ vai trò được."}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-600">Đặt lại mật khẩu</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          placeholder="Bỏ trống nếu giữ mật khẩu cũ"
        />
        <p className="text-xs text-slate-400">Đặt lại mật khẩu sẽ đăng xuất tài khoản này khỏi mọi thiết bị.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={updateUser.isPending}>
          {updateUser.isPending ? "Đang lưu..." : "Lưu"}
        </Button>
      </div>
    </form>
  );
}
