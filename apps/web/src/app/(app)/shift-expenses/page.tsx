"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { ShiftExpenseExcelActions } from "@/components/shiftExpenses/ShiftExpenseExcelActions";
import { ShiftExpenseFormModal } from "@/components/shiftExpenses/ShiftExpenseFormModal";
import { ShiftExpenseImagesModal } from "@/components/shiftExpenses/ShiftExpenseImagesModal";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useDeleteShiftExpense, useShiftExpenses } from "@/hooks/useShiftExpenses";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { can, hasScopeAll } from "@/lib/permissions";
import { clampDateRange } from "@/lib/dateRange";
import { SHIFT_EXPENSE_TYPE_OPTIONS, formatCurrency, formatDateOnly, formatNumber, labels } from "@/lib/format";
import type { ShiftExpense, ShiftExpenseType } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export default function ShiftExpensesPage() {
  const { data: currentUser } = useCurrentUser();
  // Phạm vi SELF chỉ thấy khoản chi của chính mình (router tự ép theo req.user), nên ô lọc theo
  // quán vô nghĩa với họ.
  const scopeAll = hasScopeAll(currentUser);
  const canAdd = can(currentUser, "SHIFT_EXPENSES", "ADD");
  const canEdit = can(currentUser, "SHIFT_EXPENSES", "EDIT");
  const canDelete = can(currentUser, "SHIFT_EXPENSES", "DELETE");
  const { data: users = [] } = useUserOptions({ enabled: scopeAll });

  // Mọi ô lọc đều chờ bấm "Lọc" mới có hiệu lực — hai ô cạnh nhau mà một ô áp ngay, một ô chờ nút
  // thì không đoán được.
  const emptyFilter = { from: "", to: "", search: "", type: "" as ShiftExpenseType | "", createdById: "" };
  const [filter, setFilter] = useState(emptyFilter);
  const [appliedFilter, setAppliedFilter] = useState(emptyFilter);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalExpense, setModalExpense] = useState<ShiftExpense | "new" | null>(null);
  const [imagesOf, setImagesOf] = useState<ShiftExpense | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryFilter = {
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    search: appliedFilter.search || undefined,
    type: appliedFilter.type || undefined,
    createdById: appliedFilter.createdById || undefined,
  };
  const { data, isLoading } = useShiftExpenses({ ...queryFilter, page, pageSize });
  const deleteExpense = useDeleteShiftExpense();

  function handleDelete(expense: ShiftExpense) {
    if (!window.confirm(`Xoá khoản chi "${expense.content}" ngày ${formatDateOnly(expense.spentAt)}?`)) return;
    setError(null);
    deleteExpense.mutate(expense.id, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá khoản chi thất bại"),
    });
  }

  const columns = useMemo<ColumnDef<ShiftExpense>[]>(() => {
    const base: ColumnDef<ShiftExpense>[] = [
      { header: "Ngày", accessorFn: (row) => formatDateOnly(row.spentAt), id: "spentAt" },
      { header: "Loại chi", accessorFn: (row) => labels.shiftExpenseType(row.type), id: "type" },
      { header: "Nội dung chi", accessorKey: "content" },
      { header: "Đơn vị tính", accessorFn: (row) => row.unit ?? "-", id: "unit" },
      {
        header: "Số lượng",
        id: "quantity",
        cell: ({ row }) => <span className="block text-right">{formatNumber(row.original.quantity)}</span>,
      },
      {
        header: "Đơn giá",
        id: "unitPrice",
        cell: ({ row }) => <span className="block text-right">{formatCurrency(row.original.unitPrice)}</span>,
      },
      {
        header: "Thành tiền",
        id: "amount",
        cell: ({ row }) => <span className="block text-right font-medium">{formatCurrency(row.original.amount)}</span>,
      },
      { header: "Ghi chú", accessorFn: (row) => row.note ?? "-", id: "note" },
      {
        header: "Ảnh",
        id: "images",
        cell: ({ row }) =>
          row.original.imageCount ? (
            <button
              type="button"
              onClick={() => setImagesOf(row.original)}
              className="flex items-center gap-1 text-indigo-600 hover:underline"
              title="Xem ảnh chứng từ"
            >
              <ImageIcon size={14} />
              {row.original.imageCount}
            </button>
          ) : (
            <span className="text-slate-400">-</span>
          ),
      },
    ];

    if (scopeAll) {
      base.push({ header: "Quán", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" });
    }

    base.push({
      header: "Thao tác",
      id: "actions",
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={() => setModalExpense(row.original)}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Sửa"
            >
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => handleDelete(row.original)}
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              title="Xoá"
            >
              <Trash2 size={14} />
            </button>
          )}
        </span>
      ),
    });

    return base;
    // handleDelete đổi mỗi lần render nhưng chỉ gọi mutation — thêm vào deps sẽ dựng lại cột vô ích.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeAll, canEdit, canDelete]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Chi chốt ca</h1>
          <p className="text-sm text-slate-500">Ghi các khoản chi tại quán: mỗi khoản là một dòng, có ngày riêng.</p>
        </div>
        <div className="flex items-center gap-2">
          <ShiftExpenseExcelActions filter={queryFilter} scopeAll={scopeAll} />
          {canAdd && (
            <Button onClick={() => setModalExpense("new")}>
              <Plus size={16} />
              Thêm khoản chi
            </Button>
          )}
        </div>
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
            <label className="mb-1 block text-xs font-medium text-slate-500">Loại chi</label>
            <Select value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value as ShiftExpenseType | "" }))}>
              <option value="">Tất cả loại</option>
              {SHIFT_EXPENSE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <label className="mb-1 block text-xs font-medium text-slate-500">Nội dung chi</label>
            <Input
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              placeholder="Tìm theo nội dung"
            />
          </div>
          {scopeAll && (
            <div className="w-48">
              <label className="mb-1 block text-xs font-medium text-slate-500">Quán</label>
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Danh sách khoản chi</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} emptyMessage="Chưa có khoản chi nào" />
          {/* Tổng của CẢ bộ lọc do server cộng, không phải tổng của trang đang xem — nói rõ để
              không ai đối chiếu nhầm với các dòng đang hiện. */}
          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-500">Tổng chi (theo bộ lọc)</span>
            <span className="font-semibold text-slate-800">{formatCurrency(data?.totalAmount ?? 0)}</span>
          </div>
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

      {modalExpense && (
        <ShiftExpenseFormModal
          existing={modalExpense === "new" ? undefined : modalExpense}
          onClose={() => setModalExpense(null)}
        />
      )}

      {imagesOf && (
        <ShiftExpenseImagesModal
          expenseId={imagesOf.id}
          title={imagesOf.content}
          onClose={() => setImagesOf(null)}
        />
      )}
    </div>
  );
}
