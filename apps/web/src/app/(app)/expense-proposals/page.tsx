"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useExpenseProposals } from "@/hooks/useExpenseProposals";
import { useUserOptions } from "@/hooks/useUsers";
import { clampDateRange } from "@/lib/dateRange";
import { EXPENSE_PAYER_LABEL, EXPENSE_PROPOSAL_STATUS_LABEL, EXPENSE_PROPOSAL_STATUS_TONE } from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly, formatNumber } from "@/lib/format";
import { hasScopeAll, useCan } from "@/lib/permissions";
import type { ExpenseProposal, ExpenseProposalStatus } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export default function ExpenseProposalsPage() {
  const { user, canOpen } = useCan();
  // Phạm vi SELF chỉ thấy phiếu của mình (server tự ép), nên ô lọc theo quán vô nghĩa với họ.
  const scopeAll = hasScopeAll(user);
  const { data: users = [] } = useUserOptions({ enabled: scopeAll });

  const emptyFilter = { from: "", to: "", status: "" as ExpenseProposalStatus | "", createdById: "" };
  const [filter, setFilter] = useState(emptyFilter);
  const [appliedFilter, setAppliedFilter] = useState(emptyFilter);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { data, isLoading } = useExpenseProposals({
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    status: appliedFilter.status || undefined,
    createdById: appliedFilter.createdById || undefined,
    page,
    pageSize,
  });

  const columns = useMemo<ColumnDef<ExpenseProposal>[]>(
    () => [
      { header: "Mã phiếu", accessorKey: "code" },
      { header: "Ngày tạo phiếu", accessorFn: (row) => formatDateOnly(row.proposalDate), id: "proposalDate" },
      { header: "Người lập", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" },
      { header: "Quán chi", accessorKey: "shopName" },
      {
        header: "Mục đích sử dụng",
        id: "purpose",
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-64" title={row.original.purpose}>
            {row.original.purpose}
          </span>
        ),
      },
      { header: "Người chi", accessorFn: (row) => EXPENSE_PAYER_LABEL[row.payer], id: "payer" },
      {
        header: "Tổng tiền",
        id: "totalAmount",
        cell: ({ row }) => <span className="block text-right font-medium">{formatCurrency(row.original.totalAmount)}</span>,
      },
      {
        header: "Tạm ứng",
        id: "advance",
        cell: ({ row }) =>
          row.original.advanceAmount != null ? (
            <span className="block text-right">
              {formatCurrency(row.original.advanceAmount)}
              <span className="text-xs text-slate-400"> ({formatNumber(row.original.advancePercent ?? 0)}%)</span>
            </span>
          ) : (
            <span className="block text-right text-slate-400">-</span>
          ),
      },
      {
        header: "Trạng thái",
        id: "status",
        cell: ({ row }) => (
          <Badge tone={EXPENSE_PROPOSAL_STATUS_TONE[row.original.status]}>{EXPENSE_PROPOSAL_STATUS_LABEL[row.original.status]}</Badge>
        ),
      },
      {
        header: "Thao tác",
        id: "actions",
        cell: ({ row }) => (
          <Link href={`/expense-proposals/${row.original.id}`} className="text-sm text-indigo-600 hover:underline">
            Xem chi tiết
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Phiếu đề xuất chi & tạm ứng</h1>
          <p className="text-sm text-slate-500">Quán gửi đề xuất chi, admin duyệt rồi xác nhận tạm ứng / đã chi.</p>
        </div>
        {canOpen("/expense-proposals/new") && (
          <Link href="/expense-proposals/new">
            <Button>
              <Plus size={16} />
              Thêm mới
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Từ ngày (tối đa 3 tháng)</label>
            <Input
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(e.target.value, f.to, "from") }))}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đến ngày</label>
            <Input
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(f.from, e.target.value, "to") }))}
            />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-500">Trạng thái</label>
            <Select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as ExpenseProposalStatus | "" }))}
            >
              <option value="">Tất cả</option>
              {Object.entries(EXPENSE_PROPOSAL_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          {scopeAll && (
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-slate-500">Người lập</label>
              <Select value={filter.createdById} onChange={(e) => setFilter((f) => ({ ...f, createdById: e.target.value }))}>
                <option value="">Tất cả tài khoản</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setAppliedFilter(filter);
              setPage(1);
            }}
          >
            Lọc
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách phiếu</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} emptyMessage="Chưa có phiếu đề xuất chi nào" />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
