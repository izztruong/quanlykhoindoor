"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useDecideExpenseProposal, useDeleteExpenseProposal, useExpenseProposal } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/api-client";
import {
  EXPENSE_PAYER_LABEL,
  EXPENSE_PROPOSAL_CATEGORY_LABEL,
  EXPENSE_PROPOSAL_STATUS_LABEL,
  EXPENSE_PROPOSAL_STATUS_TONE,
} from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly, formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { ExpenseProposal } from "@/types";
import { Check, CheckCheck, ListPlus, Pencil, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { ExpenseAdvanceModal } from "./ExpenseAdvanceModal";
import { ExpenseCompleteModal } from "./ExpenseCompleteModal";
import { ExpenseItemsTable } from "./ExpenseItemsTable";
import { ExpenseProposalImagesCard } from "./ExpenseProposalImagesCard";
import { ExpenseRevisionModal } from "./ExpenseRevisionModal";

const cell = "border border-slate-200 px-3 py-2";

type Dialog =
  | { kind: "reject"; scope: "proposal" | "revision" }
  | { kind: "advance" }
  | { kind: "revision" }
  | { kind: "complete" }
  | null;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  );
}

const sumAdvances = (p: ExpenseProposal) => (p.advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0);

/** Các mốc đã xảy ra của phiếu, theo thứ tự thời gian. */
function historyOf(p: ExpenseProposal) {
  const steps: { key: string; label: string; by?: string; at?: string | null }[] = [
    { key: "created", label: "Lập phiếu", by: p.createdBy?.name, at: p.createdAt },
  ];
  if (p.approvedAt) {
    steps.push({ key: "approved", label: p.status === "REJECTED" ? "Từ chối" : "Duyệt", by: p.approvedBy?.name, at: p.approvedAt });
  }
  (p.advances ?? []).forEach((a, index) =>
    steps.push({
      key: `advance-${a.id}`,
      label: `${index === 0 ? "Tạm ứng" : "Tạm ứng thêm"} ${formatCurrency(a.amount)}`,
      by: a.createdBy?.name,
      at: a.createdAt,
    }),
  );
  if (p.revisionDecidedAt) {
    steps.push({
      key: "revision",
      label: p.revisionRejectReason ? "Từ chối bổ sung hạng mục" : "Duyệt bổ sung hạng mục",
      by: p.revisionDecidedBy?.name,
      at: p.revisionDecidedAt,
    });
  }
  if (p.spentAt) steps.push({ key: "spent", label: "Hoàn thành", by: p.spentBy?.name, at: p.spentAt });
  return steps.sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime());
}

export function ExpenseProposalDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const { user, can } = useCan();
  const { data: proposal, isLoading } = useExpenseProposal(id);
  const decide = useDecideExpenseProposal(id);
  const deleteProposal = useDeleteExpenseProposal();
  const [dialog, setDialog] = useState<Dialog>(null);
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
  const total = Number(proposal.totalAmount);
  const advanced = sumAdvances(proposal);
  const remaining = Math.max(total - advanced, 0);
  const hasAdvanceFlow = proposal.advanceAmount != null || advanced > 0;

  // Nút chỉ để gọn mắt — server kiểm lại quyền, trạng thái và người duyệt ở mọi thao tác.
  const isApproverHere = Boolean(user?.isSystem || (user && user.id === proposal.approverId));
  const canDecide = can("EXPENSE_PROPOSALS", "APPROVE") && isApproverHere;
  const canApprove = status === "PENDING" && canDecide;
  const canDecideRevision = status === "REAPPROVAL" && canDecide;
  const canFirstAdvance = status === "APPROVED" && proposal.advanceAmount != null && can("EXPENSE_PROPOSALS", "ADVANCE");
  const canAdvanceMore = status === "ADVANCED" && remaining > 0 && can("EXPENSE_PROPOSALS", "ADVANCE");
  const canRevise = (status === "APPROVED" || status === "ADVANCED") && can("EXPENSE_PROPOSALS", "EDIT");
  const canComplete =
    ((status === "APPROVED" && proposal.advanceAmount == null) || status === "ADVANCED") && can("EXPENSE_PROPOSALS", "COMPLETE");
  const busy = decide.isPending || deleteProposal.isPending;
  const onError = (fallback: string) => (err: unknown) => setError(err instanceof ApiError ? err.message : fallback);

  function handleApprove(scope: "proposal" | "revision") {
    const question = scope === "revision" ? "Duyệt bảng hạng mục chi dự kiến bổ sung?" : "Duyệt phiếu đề xuất chi này?";
    if (!confirm(question)) return;
    setError(null);
    decide.mutate({ scope, outcome: "approve" }, { onError: onError("Duyệt thất bại") });
  }

  function handleReject(scope: "proposal" | "revision") {
    if (!reason.trim()) return setError("Vui lòng nhập lý do từ chối.");
    setError(null);
    decide.mutate(
      { scope, outcome: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          setDialog(null);
          setReason("");
        },
        onError: onError("Từ chối thất bại"),
      },
    );
  }

  function handleDelete() {
    if (!confirm(`Xoá phiếu ${proposal!.code}? Không thể hoàn tác.`)) return;
    setError(null);
    deleteProposal.mutate(id, { onSuccess: () => router.push("/expense-proposals"), onError: onError("Xoá phiếu thất bại") });
  }

  const pendingItems = proposal.pendingItems ?? [];
  const spent = proposal.spentAmount != null ? Number(proposal.spentAmount) : null;
  // Chênh lệch chỉ có nghĩa khi đã tạm ứng: dương = người lập phải hoàn lại, âm = công ty chi bù.
  const settlement = spent !== null && advanced > 0 ? advanced - spent : null;

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
          {status === "PENDING" && can("EXPENSE_PROPOSALS", "EDIT") && (
            <Link href={`/expense-proposals/${proposal.id}/edit`}>
              <Button type="button" variant="secondary" size="sm" disabled={busy}>
                <Pencil size={14} />
                Sửa
              </Button>
            </Link>
          )}
          {status === "PENDING" && can("EXPENSE_PROPOSALS", "DELETE") && (
            <Button type="button" variant="secondary" size="sm" onClick={handleDelete} disabled={busy}>
              <Trash2 size={14} />
              Xoá
            </Button>
          )}
          {(canApprove || canDecideRevision) && (
            <>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setDialog({ kind: "reject", scope: canDecideRevision ? "revision" : "proposal" })}
                disabled={busy}
              >
                <X size={14} />
                {canDecideRevision ? "Từ chối bổ sung" : "Từ chối"}
              </Button>
              <Button type="button" size="sm" onClick={() => handleApprove(canDecideRevision ? "revision" : "proposal")} disabled={busy}>
                <Check size={14} />
                {canDecideRevision ? "Duyệt bổ sung" : "Duyệt"}
              </Button>
            </>
          )}
          {canRevise && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDialog({ kind: "revision" })} disabled={busy}>
              <ListPlus size={14} />
              Thêm hạng mục chi dự kiến
            </Button>
          )}
          {(canFirstAdvance || canAdvanceMore) && (
            <Button type="button" size="sm" onClick={() => setDialog({ kind: "advance" })} disabled={busy}>
              <Wallet size={14} />
              {canFirstAdvance ? "Tạm ứng" : "Tạm ứng thêm"}
            </Button>
          )}
          {canComplete && (
            <Button type="button" size="sm" onClick={() => setDialog({ kind: "complete" })} disabled={busy}>
              <CheckCheck size={14} />
              Hoàn thành
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
      {status !== "REAPPROVAL" && proposal.revisionRejectReason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Bảng hạng mục bổ sung bị từ chối:</span> {proposal.revisionRejectReason}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung</CardTitle>
            </CardHeader>
            <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Ngày tạo phiếu">{formatDateOnly(proposal.proposalDate)}</Field>
              <Field label="Người lập phiếu">{proposal.createdBy?.name ?? "-"}</Field>
              <Field label="Loại phiếu">{proposal.category ? EXPENSE_PROPOSAL_CATEGORY_LABEL[proposal.category] : "-"}</Field>
              <Field label="Người chi">{EXPENSE_PAYER_LABEL[payer]}</Field>
              <Field label="Quán chi">{proposal.shop?.name ?? "-"}</Field>
              <Field label="Người duyệt">{proposal.approver?.name ?? "-"}</Field>
              <div className="md:col-span-2">
                <Field label="Mục đích sử dụng">
                  <span className="whitespace-pre-line">{proposal.purpose}</span>
                </Field>
              </div>
            </CardBody>
          </Card>

          {status === "REAPPROVAL" && (
            <Card>
              <CardHeader>
                <CardTitle>Hạng mục chi dự kiến đề nghị bổ sung — chờ duyệt</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col gap-2">
                <p className="text-sm text-slate-500">
                  Tổng hiện tại {formatCurrency(total)} → tổng đề nghị{" "}
                  <span className="font-semibold text-slate-800">{formatCurrency(proposal.pendingTotal ?? 0)}</span>. Bảng dưới đây
                  chỉ thay bảng hiện tại khi được duyệt.
                </p>
                <ExpenseItemsTable items={pendingItems} total={proposal.pendingTotal ?? 0} totalLabel="Tổng dự kiến đề nghị" />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Hạng mục chi dự kiến</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <ExpenseItemsTable items={proposal.items ?? []} total={total} totalLabel="Tổng tiền đề xuất chi (dự kiến)" />
            </CardBody>
          </Card>

          {(proposal.advances ?? []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Các lần tạm ứng</CardTitle>
              </CardHeader>
              <CardBody className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase text-slate-500">
                      <th className={`${cell} w-12 text-center`}>Lần</th>
                      <th className={cell}>Thời gian</th>
                      <th className={`${cell} text-right`}>Số tiền</th>
                      <th className={cell}>Người tạm ứng</th>
                      <th className={cell}>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(proposal.advances ?? []).map((a, index) => (
                      <tr key={a.id}>
                        <td className={`${cell} text-center text-slate-500`}>{index + 1}</td>
                        <td className={cell}>{formatDateTime(a.createdAt)}</td>
                        <td className={`${cell} text-right font-medium`}>{formatCurrency(a.amount)}</td>
                        <td className={cell}>{a.createdBy?.name ?? "-"}</td>
                        <td className={cell}>{a.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td className={`${cell} text-right font-medium text-slate-600`} colSpan={2}>
                        Tổng đã tạm ứng
                      </td>
                      <td className={`${cell} text-right font-semibold text-slate-800`}>{formatCurrency(advanced)}</td>
                      <td className={cell} colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </CardBody>
            </Card>
          )}

          {status === "SPENT" && (
            <Card>
              <CardHeader>
                <CardTitle>Hạng mục chi thực tế</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                {(proposal.spentItems ?? []).length > 0 ? (
                  <ExpenseItemsTable items={proposal.spentItems ?? []} total={spent ?? 0} totalLabel="Tổng tiền đã chi" />
                ) : (
                  // Phiếu hoàn thành trước khi có bước khai thực chi thì không có dòng nào.
                  <p className="px-5 py-4 text-sm text-slate-500">Phiếu hoàn thành trước khi có bước khai hạng mục thực chi.</p>
                )}
              </CardBody>
            </Card>
          )}

          {status === "SPENT" && (
            <ExpenseProposalImagesCard
              proposalId={proposal.id}
              imageCount={proposal._count?.images ?? 0}
              canManage={can("EXPENSE_PROPOSALS", "COMPLETE")}
            />
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{hasAdvanceFlow ? "Tổng tiền & tạm ứng" : "Tổng tiền"}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Field label="Tổng tiền đề xuất chi (dự kiến)">
                <span className="text-base font-semibold">{formatCurrency(total)}</span>
              </Field>
              {proposal.advanceAmount != null && (
                <Field label="Số tiền đề nghị tạm ứng">{formatCurrency(proposal.advanceAmount)}</Field>
              )}
              {hasAdvanceFlow && (
                <>
                  <Field label="Đã tạm ứng">
                    <span className="font-medium">{formatCurrency(advanced)}</span>
                  </Field>
                  {status !== "SPENT" && <Field label="Còn được ứng">{formatCurrency(remaining)}</Field>}
                </>
              )}
              {proposal.invoiceDueDate && (
                <Field label="Ngày trả hoá đơn dự kiến">{formatDateOnly(proposal.invoiceDueDate)}</Field>
              )}
              {spent !== null && (
                <>
                  <Field label="Tổng tiền đã chi">
                    <span className="text-base font-semibold">{formatCurrency(spent)}</span>
                  </Field>
                  {proposal.invoiceDate && <Field label="Ngày nộp hoá đơn">{formatDateOnly(proposal.invoiceDate)}</Field>}
                  {settlement !== null && settlement !== 0 && (
                    <Field label={settlement > 0 ? "Người lập phải hoàn lại" : "Phải chi bù cho người lập"}>
                      <span className={`font-semibold ${settlement > 0 ? "text-amber-700" : "text-indigo-700"}`}>
                        {formatCurrency(Math.abs(settlement))}
                      </span>
                    </Field>
                  )}
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
                  <li key={step.key} className="flex flex-col text-sm">
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

      {dialog?.kind === "reject" && (
        <Modal
          title={dialog.scope === "revision" ? `Từ chối bảng bổ sung — phiếu ${proposal.code}` : `Từ chối phiếu ${proposal.code}`}
          onClose={() => setDialog(null)}
        >
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-600">Lý do từ chối</label>
            <textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {dialog.scope === "revision" && (
              <p className="text-xs text-slate-500">Bảng hạng mục hiện tại được giữ nguyên, phiếu quay về trạng thái trước.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
                Huỷ
              </Button>
              <Button type="button" variant="danger" onClick={() => handleReject(dialog.scope)} disabled={decide.isPending || !reason.trim()}>
                {decide.isPending ? "Đang lưu..." : "Từ chối"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {dialog?.kind === "advance" && (
        <ExpenseAdvanceModal
          proposalId={proposal.id}
          code={proposal.code}
          isFirst={canFirstAdvance}
          initialAmount={canFirstAdvance && proposal.advanceAmount != null ? Math.min(Number(proposal.advanceAmount), remaining) : null}
          remaining={remaining}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog?.kind === "revision" && (
        <ExpenseRevisionModal proposal={proposal} advanced={advanced} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === "complete" && (
        <ExpenseCompleteModal proposal={proposal} onClose={() => setDialog(null)} onImageError={setError} />
      )}
    </div>
  );
}
