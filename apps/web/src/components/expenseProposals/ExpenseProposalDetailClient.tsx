"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import {
  type ExpenseProposalAction,
  useDeleteExpenseProposal,
  useExpenseProposal,
  useExpenseProposalAction,
} from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import { EXPENSE_PAYER_LABEL, EXPENSE_PROPOSAL_STATUS_LABEL, EXPENSE_PROPOSAL_STATUS_TONE } from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { ExpenseProposal } from "@/types";
import { Check, Pencil, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

const cell = "border border-slate-200 px-3 py-2";

const CONFIRM_MESSAGE: Record<Exclude<ExpenseProposalAction, "reject">, string> = {
  approve: "Duyệt phiếu đề xuất chi này?",
  advance: "Xác nhận đã tạm ứng tiền cho phiếu này?",
  spend: "Xác nhận đã chi tiền cho phiếu này?",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

/** Các mốc đã xảy ra của phiếu, theo thứ tự. */
function historyOf(p: ExpenseProposal) {
  const steps: { label: string; by?: string; at?: string | null }[] = [
    { label: "Lập phiếu", by: p.createdBy?.name, at: p.createdAt },
  ];
  if (p.approvedAt) steps.push({ label: p.status === "REJECTED" ? "Từ chối" : "Duyệt", by: p.approvedBy?.name, at: p.approvedAt });
  if (p.advancedAt) steps.push({ label: "Đã tạm ứng", by: p.advancedBy?.name, at: p.advancedAt });
  if (p.spentAt) steps.push({ label: "Đã chi", by: p.spentBy?.name, at: p.spentAt });
  return steps;
}

export function ExpenseProposalDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useCan();
  const { data: proposal, isLoading } = useExpenseProposal(id);
  const runAction = useExpenseProposalAction(id);
  const deleteProposal = useDeleteExpenseProposal();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;
  if (!proposal) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu đề xuất chi.</CardBody>
      </Card>
    );
  }

  const { status, payer } = proposal;
  const isPending = status === "PENDING";
  const canApprove = isPending && can("EXPENSE_PROPOSALS", "APPROVE");
  const canAdvance = status === "APPROVED" && payer === "ACCOUNTANT" && can("EXPENSE_PROPOSALS", "PAY");
  const canSpend =
    ((status === "APPROVED" && payer === "CREATOR") || (status === "ADVANCED" && payer === "ACCOUNTANT")) &&
    can("EXPENSE_PROPOSALS", "PAY");
  const busy = runAction.isPending || deleteProposal.isPending;
  const onError = (fallback: string) => (err: unknown) => setError(err instanceof ApiError ? err.message : fallback);

  function handleAction(action: Exclude<ExpenseProposalAction, "reject">) {
    if (!confirm(CONFIRM_MESSAGE[action])) return;
    setError(null);
    runAction.mutate({ action }, { onError: onError("Cập nhật trạng thái thất bại") });
  }

  function handleReject() {
    if (!reason.trim()) return setError("Vui lòng nhập lý do từ chối.");
    setError(null);
    runAction.mutate(
      { action: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          setRejecting(false);
          setReason("");
        },
        onError: onError("Từ chối phiếu thất bại"),
      },
    );
  }

  function handleDelete() {
    if (!confirm(`Xoá phiếu ${proposal!.code}? Không thể hoàn tác.`)) return;
    setError(null);
    deleteProposal.mutate(id, { onSuccess: () => router.push("/expense-proposals"), onError: onError("Xoá phiếu thất bại") });
  }

  const items = proposal.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/expense-proposals" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu đề xuất chi
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Phiếu {proposal.code}</h1>
            <Badge tone={EXPENSE_PROPOSAL_STATUS_TONE[status]}>{EXPENSE_PROPOSAL_STATUS_LABEL[status]}</Badge>
          </div>
          <p className="text-sm text-slate-500">Ngày tạo phiếu: {formatDateOnly(proposal.proposalDate)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPending && can("EXPENSE_PROPOSALS", "EDIT") && (
            <Link href={`/expense-proposals/${proposal.id}/edit`}>
              <Button type="button" variant="secondary" size="sm" disabled={busy}>
                <Pencil size={14} />
                Sửa
              </Button>
            </Link>
          )}
          {isPending && can("EXPENSE_PROPOSALS", "DELETE") && (
            <Button type="button" variant="secondary" size="sm" onClick={handleDelete} disabled={busy}>
              <Trash2 size={14} />
              Xoá
            </Button>
          )}
          {canApprove && (
            <>
              <Button type="button" variant="danger" size="sm" onClick={() => setRejecting(true)} disabled={busy}>
                <X size={14} />
                Từ chối
              </Button>
              <Button type="button" size="sm" onClick={() => handleAction("approve")} disabled={busy}>
                <Check size={14} />
                Duyệt
              </Button>
            </>
          )}
          {canAdvance && (
            <Button type="button" size="sm" onClick={() => handleAction("advance")} disabled={busy}>
              Đã tạm ứng
            </Button>
          )}
          {canSpend && (
            <Button type="button" size="sm" onClick={() => handleAction("spend")} disabled={busy}>
              Đã chi
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {status === "REJECTED" && proposal.rejectReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">Lý do từ chối:</span> {proposal.rejectReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung</CardTitle>
            </CardHeader>
            <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Ngày tạo phiếu">{formatDateOnly(proposal.proposalDate)}</Field>
              <Field label="Người lập phiếu">{proposal.createdBy?.name ?? "-"}</Field>
              <Field label="Người chi">{EXPENSE_PAYER_LABEL[payer]}</Field>
              <Field label="Quán chi">{proposal.shop?.name ?? "-"}</Field>
              <Field label="Người xác nhận">{proposal.approver?.name ?? "-"}</Field>
              <div className="md:col-span-2">
                <Field label="Mục đích sử dụng">
                  <span className="whitespace-pre-line">{proposal.purpose}</span>
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hạng mục chi</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className={`${cell} w-12 text-center`}>STT</th>
                    <th className={cell}>Nội dung</th>
                    <th className={`${cell} text-right`}>Đơn giá</th>
                    <th className={cell}>Đơn vị</th>
                    <th className={`${cell} text-right`}>Số lượng</th>
                    <th className={`${cell} text-right`}>Thành tiền</th>
                    <th className={cell}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td className={`${cell} text-center text-slate-500`}>{index + 1}</td>
                      <td className={cell}>{item.content}</td>
                      <td className={`${cell} text-right`}>{formatCurrency(item.unitPrice)}</td>
                      <td className={cell}>{item.unit || "-"}</td>
                      <td className={`${cell} text-right`}>{formatNumber(item.quantity)}</td>
                      <td className={`${cell} text-right font-medium`}>{formatCurrency(item.amount)}</td>
                      <td className={cell}>{item.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td className={`${cell} text-right font-medium text-slate-600`} colSpan={5}>
                      Tổng tiền đề xuất chi
                    </td>
                    <td className={`${cell} text-right font-semibold text-slate-800`}>{formatCurrency(proposal.totalAmount)}</td>
                    <td className={cell} />
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{payer === "ACCOUNTANT" ? "Tổng tiền & tạm ứng" : "Tổng tiền"}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label="Tổng tiền đề xuất chi">
                <span className="text-base font-semibold">{formatCurrency(proposal.totalAmount)}</span>
              </Field>
              {payer === "ACCOUNTANT" && (
                <>
                  <Field label="Tạm ứng (%)">{formatNumber(proposal.advancePercent ?? 0)}%</Field>
                  <Field label="Số tiền tạm ứng">
                    <span className="font-medium">{formatCurrency(proposal.advanceAmount ?? 0)}</span>
                  </Field>
                  <Field label="Ngày trả hoá đơn">{proposal.invoiceDueDate ? formatDateOnly(proposal.invoiceDueDate) : "-"}</Field>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lịch sử xử lý</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="flex flex-col gap-3">
                {historyOf(proposal).map((step) => (
                  <li key={step.label} className="flex flex-col text-sm">
                    <span className="font-medium text-slate-700">{step.label}</span>
                    <span className="text-slate-500">
                      {step.by ?? "-"} · {step.at ? formatDateTime(step.at) : "-"}
                    </span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>

      {rejecting && (
        <Modal title={`Từ chối phiếu ${proposal.code}`} onClose={() => setRejecting(false)}>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-600">Lý do từ chối</label>
            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRejecting(false)}>
                Huỷ
              </Button>
              <Button type="button" variant="danger" onClick={handleReject} disabled={runAction.isPending || !reason.trim()}>
                {runAction.isPending ? "Đang lưu..." : "Từ chối phiếu"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
