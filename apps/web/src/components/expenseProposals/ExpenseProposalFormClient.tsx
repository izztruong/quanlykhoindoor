"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCreateExpenseProposal, useUpdateExpenseProposal } from "@/hooks/useExpenseProposals";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import {
  EXPENSE_PAYER_LABEL,
  EXPENSE_PROPOSAL_CATEGORY_LABEL,
  computeExpenseTotals,
  todayForDateInput,
} from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import type { ExpensePayer, ExpenseProposal, ExpenseProposalCategory } from "@/types";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface ItemRow {
  /** Khoá React cục bộ — dòng không có id ổn định khi thêm/xoá giữa chừng. */
  key: number;
  content: string;
  unitPrice: string;
  unit: string;
  quantity: string;
  note: string;
}

// Bộ đếm cấp module cho khoá dòng: đọc/ghi ref trong lúc render bị React cấm.
let rowKeySeed = 0;
const newKey = () => rowKeySeed++;

const blankRow = (key: number): ItemRow => ({ key, content: "", unitPrice: "", unit: "", quantity: "", note: "" });

const isBlankRow = (row: ItemRow) =>
  [row.content, row.unitPrice, row.unit, row.quantity, row.note].every((value) => value.trim() === "");

const toNumber = (value: string) => (value.trim() === "" ? 0 : Number(value));

const cell = "border border-slate-200 px-2 py-1.5";
const headCell = "border border-slate-200 px-2 py-2";

export function ExpenseProposalFormClient({ existing }: { existing?: ExpenseProposal }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const createProposal = useCreateExpenseProposal();
  const updateProposal = useUpdateExpenseProposal(existing?.id ?? "");

  const [proposalDate, setProposalDate] = useState(() => (existing ? toDateInput(existing.proposalDate) : todayForDateInput()));
  const [payer, setPayer] = useState<ExpensePayer>(existing?.payer ?? "CREATOR");
  const [category, setCategory] = useState<ExpenseProposalCategory | "">(existing?.category ?? "");
  // Chỉ tài khoản thuộc vai trò "là quán" (mặc định của /users/options).
  const { data: shops = [] } = useUserOptions();
  // null = chưa đụng tới ô chọn: phiếu mới thì chọn sẵn chính người lập nếu họ là quán. Phải tính lúc
  // render vì danh sách quán và tài khoản đăng nhập tải về sau khi form đã khởi tạo state.
  const [pickedShopId, setPickedShopId] = useState<string | null>(existing ? (existing.shopId ?? "") : null);
  const wantedShopId = pickedShopId ?? currentUser?.id ?? "";
  // Quán không còn trong danh sách (vd vai trò đã bỏ cờ "là quán") thì coi như chưa chọn, bắt chọn lại.
  const shopId = shops.some((s) => s.id === wantedShopId) ? wantedShopId : "";
  // Người xác nhận: ngược lại với quán — chỉ tài khoản KHÔNG phải quán.
  const { data: approvers = [] } = useUserOptions({ scope: "other" });
  const [pickedApproverId, setPickedApproverId] = useState(existing?.approverId ?? "");
  const approverId = approvers.some((a) => a.id === pickedApproverId) ? pickedApproverId : "";
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() =>
    existing?.items?.length
      ? existing.items.map((it) => ({
          key: newKey(),
          content: it.content,
          unitPrice: String(Number(it.unitPrice)),
          unit: it.unit ?? "",
          quantity: String(Number(it.quantity)),
          note: it.note ?? "",
        }))
      : [blankRow(newKey())],
  );
  const [advancePercent, setAdvancePercent] = useState(existing?.advancePercent != null ? String(Number(existing.advancePercent)) : "");
  const [invoiceDueDate, setInvoiceDueDate] = useState(existing?.invoiceDueDate ? toDateInput(existing.invoiceDueDate) : "");
  const [error, setError] = useState<string | null>(null);

  const isAccountant = payer === "ACCOUNTANT";
  const percent = advancePercent.trim() === "" ? null : Number(advancePercent);
  const { amounts, total, advanceAmount } = computeExpenseTotals(
    rows.map((row) => ({ unitPrice: toNumber(row.unitPrice), quantity: toNumber(row.quantity) })),
    isAccountant && percent !== null && !Number.isNaN(percent) ? percent : null,
  );

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function handleSubmit() {
    setError(null);

    if (!proposalDate) return setError("Vui lòng chọn ngày tạo phiếu.");
    if (!category) return setError("Vui lòng chọn loại phiếu.");
    if (!shopId) return setError("Vui lòng chọn quán chi.");
    if (!approverId) return setError("Vui lòng chọn người xác nhận.");
    if (!purpose.trim()) return setError("Vui lòng nhập mục đích sử dụng.");

    const filled = rows.map((row, index) => ({ row, stt: index + 1 })).filter(({ row }) => !isBlankRow(row));
    if (filled.length === 0) return setError("Vui lòng nhập ít nhất 1 hạng mục.");
    for (const { row, stt } of filled) {
      if (!row.content.trim()) return setError(`Dòng ${stt}: chưa nhập nội dung.`);
      if (row.unitPrice.trim() === "" || Number(row.unitPrice) < 0) return setError(`Dòng ${stt}: đơn giá không hợp lệ.`);
      if (!(Number(row.quantity) > 0)) return setError(`Dòng ${stt}: số lượng phải lớn hơn 0.`);
    }

    if (isAccountant) {
      if (percent === null || !(percent > 0 && percent <= 100)) return setError("Tạm ứng (%) phải lớn hơn 0 và không quá 100.");
      if (!invoiceDueDate) return setError("Vui lòng chọn ngày trả hoá đơn.");
    }

    const payload = {
      proposalDate,
      payer,
      category,
      shopId,
      approverId,
      purpose: purpose.trim(),
      items: filled.map(({ row }) => ({
        content: row.content.trim(),
        unitPrice: Number(row.unitPrice),
        unit: row.unit.trim() || undefined,
        quantity: Number(row.quantity),
        note: row.note.trim() || undefined,
      })),
      advancePercent: isAccountant ? (percent ?? undefined) : undefined,
      invoiceDueDate: isAccountant ? invoiceDueDate : undefined,
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
            <label className="text-sm font-medium text-slate-600">Loại phiếu</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as ExpenseProposalCategory | "")}>
              <option value="">— Chọn loại phiếu —</option>
              {Object.entries(EXPENSE_PROPOSAL_CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
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
            <label className="text-sm font-medium text-slate-600">Người xác nhận</label>
            <Select value={approverId} onChange={(e) => setPickedApproverId(e.target.value)}>
              <option value="">— Chọn người xác nhận —</option>
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
          <CardTitle>Hạng mục chi</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className={`${headCell} w-10 text-center`}>STT</th>
                  <th className={headCell}>Nội dung</th>
                  <th className={`${headCell} w-36`}>Đơn giá</th>
                  <th className={`${headCell} w-24`}>Đơn vị</th>
                  <th className={`${headCell} w-24`}>Số lượng</th>
                  <th className={`${headCell} w-36 text-right`}>Thành tiền</th>
                  <th className={`${headCell} w-44`}>Ghi chú</th>
                  <th className={`${headCell} w-10`} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key}>
                    <td className={`${cell} text-center text-slate-500`}>{index + 1}</td>
                    <td className={cell}>
                      <Input className="h-8" value={row.content} onChange={(e) => updateRow(row.key, { content: e.target.value })} />
                    </td>
                    <td className={cell}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="h-8"
                        value={row.unitPrice}
                        onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                      />
                    </td>
                    <td className={cell}>
                      <Input className="h-8" value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} />
                    </td>
                    <td className={cell}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        className="h-8"
                        value={row.quantity}
                        onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td className={`${cell} text-right font-medium text-slate-700`}>{formatCurrency(amounts[index] || 0)}</td>
                    <td className={cell}>
                      <Input className="h-8" value={row.note} onChange={(e) => updateRow(row.key, { note: e.target.value })} />
                    </td>
                    <td className={`${cell} text-center`}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        disabled={rows.length === 1}
                        title="Xoá dòng"
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setRows((prev) => [...prev, blankRow(newKey())])}>
            <Plus size={14} />
            Thêm dòng
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tổng tiền{isAccountant ? " & tạm ứng" : ""}</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-sm font-medium text-slate-600">Tổng tiền đề xuất chi</label>
            <p className="text-lg font-semibold text-slate-800">{formatCurrency(total)}</p>
          </div>
          {isAccountant && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Tạm ứng (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={advancePercent}
                  onChange={(e) => setAdvancePercent(e.target.value)}
                  placeholder="VD: 50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Số tiền tạm ứng</label>
                <Input value={advanceAmount !== null ? formatCurrency(advanceAmount) : ""} disabled className="bg-slate-50 font-medium text-slate-700" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Ngày trả hoá đơn</label>
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
