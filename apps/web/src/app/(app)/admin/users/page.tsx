"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreateUser, useDeleteUser, useUsers, type ManagedUser } from "@/hooks/useUsers";
import { useClientPagination } from "@/hooks/useClientPagination";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import type { ColumnDef } from "@tanstack/react-table";
import { Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

const roleLabel: Record<string, string> = { ADMIN: "Quản trị viên", STAFF: "Nhân viên" };

export default function UsersPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: users = [], isLoading } = useUsers();
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(users);
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const [form, setForm] = useState({ email: "", password: "", name: "", role: "STAFF" as "ADMIN" | "STAFF" });
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const adminCount = users.filter((u) => u.role === "ADMIN").length;

  const columns = useMemo<ColumnDef<ManagedUser>[]>(
    () => [
      { header: "Tên", accessorKey: "name" },
      { header: "Email", accessorKey: "email" },
      {
        header: "Vai trò",
        id: "role",
        cell: ({ row }) => <Badge tone={row.original.role === "ADMIN" ? "blue" : "gray"}>{roleLabel[row.original.role]}</Badge>,
      },
      { header: "Ngày tạo", accessorFn: (row) => formatDateTime(row.createdAt), id: "createdAt" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => {
          const isSelf = row.original.id === currentUser?.id;
          const isLastAdmin = row.original.role === "ADMIN" && adminCount <= 1;
          const disabled = isSelf || isLastAdmin || deleteUser.isPending;
          const title = isSelf
            ? "Không thể tự xoá tài khoản của chính mình"
            : isLastAdmin
              ? "Không thể xoá quản trị viên cuối cùng"
              : "Xoá tài khoản";
          return (
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
          );
        },
      },
    ],
    [currentUser?.id, deleteUser, adminCount],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(form, {
      onSuccess: () => setForm({ email: "", password: "", name: "", role: "STAFF" }),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Tạo tài khoản thất bại"),
    });
  }

  if (currentUser && currentUser.role !== "ADMIN") {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Bạn không có quyền truy cập trang này.</CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Quản lý tài khoản</h1>
        <p className="text-sm text-slate-500">Tạo hoặc xoá tài khoản đăng nhập cho nhân viên.</p>
      </div>

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
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "ADMIN" | "STAFF" }))}>
                <option value="STAFF">Nhân viên</option>
                <option value="ADMIN">Quản trị viên</option>
              </Select>
            </div>
            <Button type="submit" disabled={createUser.isPending}>
              <UserPlus size={16} />
              Tạo tài khoản
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </CardBody>
      </Card>

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
    </div>
  );
}
