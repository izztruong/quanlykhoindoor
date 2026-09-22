"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreateExpenseProposal, useUpdateExpenseProposal } from "@/hooks/useExpenseProposals";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { EXPENSE_PAYER_LABEL, todayForDateInput } from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import type { ExpensePayer, ExpenseProposal } from "@/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExpenseItemsEditor, rowsFromItems, totalsOf, validateRows, type ItemRow } from "./ExpenseItemsEditor";

export function ExpenseProposalFormClient({ existing }: { existing?: ExpenseProposal }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const createProposal = useCreateExpenseProposal();
  const updateProposal = useUpdateExpenseProposal(existing?.id ?? "");

  const [proposalDate, setProposalDate] = useState(() => (existing ? toDateInput(existing.proposalDate) : todayForDateInput()));
  const [payer, setPayer] = useState<ExpensePayer>(existing?.payer ?? "CREATOR");
  // Chỉ tài khoản thuộc vai trò "là quán" (mặc định của /users/options).
  const { data: shops = [] } = useUserOptions();
  // null = chưa đụng tới ô chọn: phiếu mới thì chọn sẵn chính người lập nếu họ là quán. Phải tính lúc
  // render vì danh sách quán và tài khoản đăng nhập tải về sau khi form đã khởi tạo state.
  const [pickedShopId, setPickedShopId] = useState<string | null>(existing ? (existing.shopId ?? "") : null);
  const wantedShopId = pickedShopId ?? currentUser?.id ?? "";
  // Quán không còn trong danh sách (vd vai trò đã bỏ cờ "là quán") thì coi như chưa chọn, bắt chọn lại.
  const shopId = shops.some((s) => s.id === wantedShopId) ? wantedShopId : "";
  // Người duyệt: ngược lại với quán — chỉ tài khoản KHÔNG phải quán.
  const { data: approvers = [] } = useUserOptions({ scope: "other" });
  const [pickedApproverId, setPickedApproverId] = useState(existing?.approverId ?? "");
  const approverId = approvers.some((a) => a.id === pickedApproverId) ? pickedApproverId : "";
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromItems(existing?.items));
  const [advanceAmount, setAdvanceAmount] = useState(existing?.advanceAmount != null ? String(Number(existing.advanceAmount)) : "");
  const [invoiceDueDate, setInvoiceDueDate] = useState(existing?.invoiceDueDate ? toDateInput(existing.invoiceDueDate) : "");
  const [error, setError] = useState<string | null>(null);

  const isCreator = payer === "CREATOR";
  const { total } = totalsOf(rows);
  const advance = advanceAmount.trim() === "" ? null : Number(advanceAmount);

  function handleSubmit() {
    setError(null);

    if (!proposalDate) return setError("Vui lòng chọn ngày tạo phiếu.");
    if (!shopId) return setError("Vui lòng chọn quán chi.");
    if (!approverId) return setError("Vui lòng chọn người duyệt.");
    if (!purpose.trim()) return setError("Vui lòng nhập mục đích sử dụng.");

    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);

    if (isCreator) {
      if (advance === null || !(advance > 0)) return setError("Số tiền đề nghị tạm ứng phải lớn hơn 0.");
      if (advance > total) return setError("Số tiền đề nghị tạm ứng không được vượt tổng dự kiến.");
      if (!invoiceDueDate) return setError("Vui lòng chọn ngày trả hoá đơn dự kiến.");
    }

    const payload = {
      proposalDate,
      payer,
      shopId,
      approverId,
      purpose: purpose.trim(),
      items: checked.items,
      advanceAmount: isCreator ? (advance ?? undefined) : undefined,
      invoiceDueDate: isCreator ? invoiceDueDate : undefined,
    };

    const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Lưu phiếu thất bại");
    if (isEdit && existing) {
      updateProposal.mutate(payload, { onSuccess: () => router.push(`/expense-proposals/${existing.id}`), onError });
    } else {
      createProposal.mutate(payload, { onSuccess: (created) => router.push(`/expense-proposals/${created.id}`), onError });
    }
  }

  const isPending = isEdit ? updateProposal.isPending : createProposal.isPending;
  const backHref = isEdit && existing ? `/expense-proposals/${existing.id}` : "/expense-proposals";
  const creatorName = isEdit ? (existing?.createdBy?.name ?? "-") : (currentUser?.name ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={backHref} className="self-start text-sm text-indigo-600 hover:underline">
          ← {isEdit ? "Chi tiết phiếu" : "Danh sách phiếu đề xuất chi"}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-800">
          {isEdit ? `Sửa phiếu ${existing?.code}` : "Tạo phiếu đề xuất chi & tạm ứng"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Ngày tạo phiếu</label>
            <Input type="date" value={proposalDate} onChange={(e) => setProposalDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Người lập phiếu</label>
            <Input value={creatorName} disabled className="bg-slate-50 text-slate-600" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Người chi</label>
            <Select value={payer} onChange={(e) => setPayer(e.target.value as ExpensePayer)}>
              {Object.entries(EXPENSE_PAYER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán chi</label>
            <Select value={shopId} onChange={(e) => setPickedShopId(e.target.value)}>
              <option value="">— Chọn quán —</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Người duyệt</label>
            <Select value={approverId} onChange={(e) => setPickedApproverId(e.target.value)}>
              <option value="">— Chọn người duyệt —</option>
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>
                  {approver.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-sm font-medium text-slate-600">Mục đích sử dụng</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              placeholder="Chi cho việc gì"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hạng mục chi dự kiến</CardTitle>
        </CardHeader>
        <CardBody>
          <ExpenseItemsEditor rows={rows} onChange={setRows} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tổng tiền{isCreator ? " & tạm ứng" : ""}</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-sm font-medium text-slate-600">Tổng tiền đề xuất chi (dự kiến)</label>
            <p className="text-lg font-semibold text-slate-800">{formatCurrency(total)}</p>
          </div>
          {isCreator && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Số tiền đề nghị tạm ứng</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  placeholder="VD: 500000"
                />
                <span className="text-xs text-slate-400">Không vượt tổng dự kiến. Kế toán có thể sửa khi tạm ứng.</span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Ngày trả hoá đơn dự kiến</label>
                <Input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Gửi đề xuất"}
        </Button>
      </div>
    </div>
  );
}
