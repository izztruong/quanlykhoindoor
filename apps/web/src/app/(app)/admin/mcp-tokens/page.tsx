"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { McpTokenFormClient } from "@/components/mcpTokens/McpTokenFormClient";
import { McpTokenReveal } from "@/components/mcpTokens/McpTokenReveal";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useClientPagination } from "@/hooks/useClientPagination";
import { useDeleteMcpToken, useMcpToolCatalog, useMcpTokens } from "@/hooks/useMcpTokens";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { CreatedMcpToken, McpToken } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export default function McpTokensPage() {
  const { can } = useCan();
  const { data: tokens = [], isLoading } = useMcpTokens();
  const { data: catalog } = useMcpToolCatalog();
  const { page, pageSize, pageItems, total, setPage, onPageSizeChange } = useClientPagination(tokens);
  const deleteToken = useDeleteMcpToken();
  const [editing, setEditing] = useState<McpToken | "new" | null>(null);
  const [created, setCreated] = useState<CreatedMcpToken | null>(null);

  const canAdd = can("MCP_TOKENS", "ADD");
  const canEdit = can("MCP_TOKENS", "EDIT");
  const canDelete = can("MCP_TOKENS", "DELETE");

  const columns = useMemo<ColumnDef<McpToken>[]>(() => {
    const toolTitle = new Map((catalog?.items ?? []).map((t) => [t.name, t.title]));
    return [
      { header: "Tên token", accessorKey: "name" },
      {
        header: "Token",
        id: "tokenPrefix",
        cell: ({ row }) => <code className="text-xs text-slate-500">{row.original.tokenPrefix}…</code>,
      },
      {
        header: "Tool được dùng",
        id: "tools",
        cell: ({ row }) => (
          <span
            className="block text-center"
            title={row.original.tools.map((name) => toolTitle.get(name) ?? name).join("\n")}
          >
            {row.original.tools.length}/{catalog?.items.length ?? "?"}
          </span>
        ),
      },
      {
        header: "Dùng lần cuối",
        id: "lastUsedAt",
        cell: ({ row }) => (row.original.lastUsedAt ? formatDateTime(row.original.lastUsedAt) : <span className="text-slate-400">Chưa dùng</span>),
      },
      { header: "Người tạo", id: "createdBy", cell: ({ row }) => row.original.createdBy?.name ?? "—" },
      { header: "Ngày tạo", accessorFn: (row) => formatDateTime(row.createdAt), id: "createdAt" },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => {
          const token = row.original;
          return (
            <span className="flex items-center justify-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  title="Sửa tên / tool được dùng"
                  disabled={!catalog}
                  onClick={() => setEditing(token)}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  title="Xoá token"
                  disabled={deleteToken.isPending}
                  onClick={() => {
                    if (confirm(`Xoá token "${token.name}"? Connector đang dùng token này sẽ ngừng chạy ngay.`)) {
                      deleteToken.mutate(token.id);
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
    ];
  }, [catalog, canEdit, canDelete, deleteToken]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Token MCP</h1>
          <p className="text-sm text-slate-500">
            Cho Claude trên web đọc dữ liệu để làm báo cáo. Mỗi token chỉ gọi được những tool được tick, và đọc được dữ liệu của
            mọi quán trong các tool đó. Sửa hay xoá có hiệu lực ngay.
          </p>
          {catalog && (
            <p className="mt-1 text-sm text-slate-500">
              URL connector: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{catalog.endpoint}</code>
            </p>
          )}
        </div>
        {canAdd && (
          <Button onClick={() => setEditing("new")} disabled={!catalog} className="shrink-0">
            <Plus size={16} />
            Tạo token
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách token</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={pageItems} isLoading={isLoading} />
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={onPageSizeChange} />
        </CardBody>
      </Card>

      {editing && catalog && (
        <Modal title={editing === "new" ? "Tạo token MCP" : `Sửa token: ${editing.name}`} onClose={() => setEditing(null)} size="lg">
          <McpTokenFormClient
            tools={catalog.items}
            existing={editing === "new" ? undefined : editing}
            onCreated={(token) => {
              setEditing(null);
              setCreated(token);
            }}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {created && catalog && (
        <Modal title={`Token "${created.name}" đã tạo`} onClose={() => setCreated(null)} size="lg">
          <McpTokenReveal token={created.token} endpoint={catalog.endpoint} onClose={() => setCreated(null)} />
        </Modal>
      )}
    </div>
  );
}
