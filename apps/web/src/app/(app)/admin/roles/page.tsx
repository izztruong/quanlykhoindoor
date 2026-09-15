"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { RoleFormClient } from "@/components/roles/RoleFormClient";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useDeleteRole, usePermissionCatalog, useRoles } from "@/hooks/useRoles";
import { ApiError } from "@/lib/api-client";
import { useCan } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import type { Role } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export default function RolesPage() {
  const { user: currentUser, can } = useCan();
  const { data: roles = [], isLoading } = useRoles();
  const { data: catalog } = usePermissionCatalog();
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(roles);
  const deleteRole = useDeleteRole();
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canAdd = can("ROLES", "ADD");
  const canEdit = can("ROLES", "EDIT");
  const canDelete = can("ROLES", "DELETE");

  const columns = useMemo<ColumnDef<Role>[]>(
    () => [
      {
        header: "Tên vai trò",
        id: "name",
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            {row.original.name}
            {row.original.isSystem && <Badge tone="blue">Hệ thống</Badge>}
            {row.original.isShop && <Badge tone="green">Quán</Badge>}
          </span>
        ),
      },
      {
        header: "Số quyền",
        id: "permissions",
        cell: ({ row }) => (
          <span className="block text-center">{row.original.isSystem ? "Toàn quyền" : row.original.permissions.length}</span>
        ),
      },
      { header: "Số tài khoản", id: "users", cell: ({ row }) => <span className="block text-center">{row.original._count.users}</span> },
      { header: "Ngày tạo", accessorFn: (row) => formatDateTime(row.createdAt), id: "createdAt" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => {
          const role = row.original;
          const isOwn = role.id === currentUser?.roleId;
          const lockReason = role.isSystem ? "Vai trò hệ thống không sửa/xoá được" : isOwn ? "Không sửa/xoá được vai trò bạn đang giữ" : null;
          return (
            <span className="flex items-center justify-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  disabled={Boolean(lockReason)}
                  title={lockReason ?? "Sửa vai trò"}
                  onClick={() => setEditing(role)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={Boolean(lockReason) || role._count.users > 0 || deleteRole.isPending}
                  title={lockReason ?? (role._count.users > 0 ? "Vai trò còn tài khoản đang dùng" : "Xoá vai trò")}
                  onClick={() => {
                    setDeleteError(null);
                    if (confirm(`Xoá vai trò ${role.name}?`)) {
                      deleteRole.mutate(role.id, {
                        onError: (err) => setDeleteError(err instanceof ApiError ? err.message : "Xoá vai trò thất bại"),
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
    [currentUser?.roleId, canEdit, canDelete, deleteRole],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Vai trò & phân quyền</h1>
          <p className="text-sm text-slate-500">
            Mỗi tài khoản thuộc một vai trò; vai trò quyết định được xem và thao tác trang nào. Gỡ quyền có hiệu lực ngay, không cần
            đăng nhập lại.
          </p>
        </div>
        {canAdd && (
          <Button onClick={() => setEditing("new")} disabled={!catalog}>
            <Plus size={16} />
            Thêm vai trò
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách vai trò</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={pageItems} isLoading={isLoading} />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
        {deleteError && <p className="px-4 pb-4 text-sm text-red-600">{deleteError}</p>}
      </Card>

      {editing && catalog && currentUser && (
        <Modal title={editing === "new" ? "Thêm vai trò" : `Sửa vai trò: ${editing.name}`} onClose={() => setEditing(null)} size="lg">
          <RoleFormClient
            catalog={catalog}
            currentUser={currentUser}
            existing={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
