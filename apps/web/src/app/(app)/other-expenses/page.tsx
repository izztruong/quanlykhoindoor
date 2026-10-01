"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { OtherExpenseExcelActions } from "@/components/otherExpenses/OtherExpenseExcelActions";
import { OtherExpenseFormModal } from "@/components/otherExpenses/OtherExpenseFormModal";
import { OtherExpenseImagesModal } from "@/components/otherExpenses/OtherExpenseImagesModal";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useDeleteOtherExpense, useOtherExpenses } from "@/hooks/useOtherExpenses";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { clampDateRange } from "@/lib/dateRange";
import { formatCurrency, formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { can, hasScopeAll } from "@/lib/permissions";
import type { OtherExpense } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";
import { ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

export default function OtherExpensesPage() {
  const { data: currentUser } = useCurrentUser();
  // Phạm vi SELF chỉ thấy khoản chi của chính mình (router tự ép theo req.user), nên ô lọc theo
  // người tạo vô nghĩa với họ.
  const scopeAll = hasScopeAll(currentUser);
  const canAdd = can(currentUser, "OTHER_EXPENSES", "ADD");
  const canEdit = can(currentUser, "OTHER_EXPENSES", "EDIT");
  const canDelete = can(currentUser, "OTHER_EXPENSES", "DELETE");
  const { data: users = [] } = useUserOptions({ enabled: scopeAll });

  // Mọi ô lọc đều chờ bấm "Lọc" mới có hiệu lực — hai ô cạnh nhau mà một ô áp ngay, một ô chờ nút
  // thì không đoán được.
  const emptyFilter = { from: "", to: "", search: "", createdById: "" };
  const [filter, setFilter] = useState(emptyFilter);
  const [appliedFilter, setAppliedFilter] = useState(emptyFilter);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalExpense, setModalExpense] = useState<OtherExpense | "new" | null>(null);
  const [imagesOf, setImagesOf] = useState<OtherExpense | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryFilter = {
    from: appliedFilter.from || undefined,
    to: appliedFilter.to || undefined,
    search: appliedFilter.search || undefined,
    createdById: appliedFilter.createdById || undefined,
  };
  const { data, isLoading } = useOtherExpenses({ ...queryFilter, page, pageSize });
  const deleteExpense = useDeleteOtherExpense();

  function handleDelete(expense: OtherExpense) {
    if (!window.confirm(`Xoá khoản chi "${expense.content}" ngày ${formatDateOnly(expense.spentAt)}?`)) return;
    setError(null);
    deleteExpense.mutate(expense.id, {
      onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá khoản chi thất bại"),
    });
  }

  const columns = useMemo<ColumnDef<OtherExpense>[]>(() => {
    const base: ColumnDef<OtherExpense>[] = [
      { header: "Ngày chi", accessorFn: (row) => formatDateOnly(row.spentAt), id: "spentAt" },
      {
        header: "Ngày lập phiếu",
        id: "createdAt",
        // formatDateTime chứ KHÔNG phải formatDateOnly: formatDateOnly đọc theo getUTC* (đúng cho
        // spentAt vì đó là cột DATE lưu ở nửa đêm UTC), còn createdAt là mốc thật — khoản ghi sau
        // 17h giờ VN sẽ hiện lùi một ngày nếu đọc theo UTC.
        cell: ({ row }) => <span className="text-slate-500">{formatDateTime(row.original.createdAt)}</span>,
      },
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
      base.push({ header: "Người tạo", accessorFn: (row) => row.createdBy?.name ?? "-", id: "createdBy" });
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
          <h1 className="text-xl font-semibold text-slate-800">Chi ngoài</h1>
          <p className="text-sm text-slate-500">Ghi lại các khoản chi ngoài: mỗi khoản là một dòng, có ngày riêng.</p>
        </div>
        <div className="flex items-center gap-2">
          <OtherExpenseExcelActions filter={queryFilter} scopeAll={scopeAll} />
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
            <label className="mb-1 block text-xs font-medium text-slate-500">Từ ngày chi (tối đa 3 tháng)</label>
            <Input
              type="date"
              value={filter.from}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(e.target.value, f.to, "from") }))}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium text-slate-500">Đến ngày chi</label>
            <Input
              type="date"
              value={filter.to}
              onChange={(e) => setFilter((f) => ({ ...f, ...clampDateRange(f.from, e.target.value, "to") }))}
            />
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Người tạo</label>
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
            <span className="font-medium text-slate-500">Tổng tiền (theo bộ lọc)</span>
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
        <OtherExpenseFormModal
          existing={modalExpense === "new" ? undefined : modalExpense}
          onClose={() => setModalExpense(null)}
        />
      )}

      {imagesOf && (
        <OtherExpenseImagesModal expenseId={imagesOf.id} title={imagesOf.content} onClose={() => setImagesOf(null)} />
      )}
    </div>
  );
}
