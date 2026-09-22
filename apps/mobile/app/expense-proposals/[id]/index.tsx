import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { ExpenseAdvanceModal } from "@/components/expenseProposals/ExpenseAdvanceModal";
import { ExpenseProposalImagesCard } from "@/components/expenseProposals/ExpenseProposalImagesCard";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useDecideExpenseProposal, useDeleteExpenseProposal, useExpenseProposal } from "@/hooks/useExpenseProposals";
import { ApiError } from "@/lib/apiClient";
import {
  EXPENSE_PAYER_LABEL,
  EXPENSE_PROPOSAL_CATEGORY_LABEL,
  EXPENSE_PROPOSAL_STATUS_LABEL,
  EXPENSE_PROPOSAL_STATUS_TONE,
} from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly, formatDateVN, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpenseProposal, ExpenseProposalItem, ExpenseProposalPendingItem } from "@/types";

type Scope = "proposal" | "revision";

const sumAdvances = (p: ExpenseProposal) => (p.advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0);

/** Các mốc đã xảy ra của phiếu, theo thứ tự thời gian — giống historyOf bên web. */
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

export default function ExpenseProposalDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();
  const { user, can } = useCan();
  const { data: proposal, isLoading, isRefetching, refetch } = useExpenseProposal(id);
  const decide = useDecideExpenseProposal(id);
  const deleteProposal = useDeleteExpenseProposal();
  const [rejectScope, setRejectScope] = useState<Scope | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Phiếu đề xuất chi" }} />
        <LoadingState />
      </>
    );
  }

  if (!proposal) {
    return (
      <>
        <Stack.Screen options={{ title: "Phiếu đề xuất chi" }} />
        <ErrorState message="Không tìm thấy phiếu đề xuất chi." />
      </>
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

  const spent = proposal.spentAmount != null ? Number(proposal.spentAmount) : null;
  // Chênh lệch chỉ có nghĩa khi đã tạm ứng: dương = người lập phải hoàn lại, âm = công ty chi bù.
  const settlement = spent !== null && advanced > 0 ? advanced - spent : null;

  /**
   * 409 nghĩa là phiếu vừa được người khác xử lý (hai người bấm cùng lúc) hoặc đã đổi trạng thái.
   * Toast lỗi đã hiện ở MutationCache; tải lại để màn hình khớp trạng thái thật và các nút tự đổi.
   */
  function refetchOnConflict(err: unknown) {
    if (err instanceof ApiError && err.status === 409) refetch();
  }

  function confirmApprove(scope: Scope) {
    const message = scope === "revision" ? "Duyệt bảng hạng mục chi dự kiến bổ sung?" : "Duyệt phiếu đề xuất chi này?";
    Alert.alert(scope === "revision" ? "Duyệt bổ sung" : "Duyệt phiếu", message, [
      { text: "Huỷ", style: "cancel" },
      { text: "Duyệt", onPress: () => decide.mutate({ scope, outcome: "approve" }, { onError: refetchOnConflict }) },
    ]);
  }

  function submitReject() {
    if (!rejectScope) return;
    if (!reason.trim()) {
      setReasonError("Vui lòng nhập lý do từ chối.");
      return;
    }
    decide.mutate(
      { scope: rejectScope, outcome: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          setRejectScope(null);
          setReason("");
          setReasonError(null);
        },
        onError: (err) => {
          setRejectScope(null);
          refetchOnConflict(err);
        },
      },
    );
  }

  function confirmDelete() {
    Alert.alert("Xoá phiếu", `Xoá phiếu ${proposal!.code}? Không thể hoàn tác.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: () => deleteProposal.mutate(id, { onSuccess: () => router.back(), onError: refetchOnConflict }),
      },
    ]);
  }

  const hasMainActions = canApprove || canDecideRevision || canFirstAdvance || canAdvanceMore || canComplete || canRevise;

  return (
    <>
      <Stack.Screen options={{ title: proposal.code }} />
      <Screen refreshing={isRefetching} onRefresh={() => refetch()}>
        <Card>
          <CardBody style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.code}>{proposal.code}</Text>
              <Badge tone={EXPENSE_PROPOSAL_STATUS_TONE[status]}>{EXPENSE_PROPOSAL_STATUS_LABEL[status]}</Badge>
            </View>
            <InfoRow label="Ngày tạo phiếu" value={formatDateOnly(proposal.proposalDate)} />
            <InfoRow label="Loại phiếu" value={proposal.category ? EXPENSE_PROPOSAL_CATEGORY_LABEL[proposal.category] : "—"} />
            <InfoRow label="Người lập" value={proposal.createdBy?.name ?? "—"} />
            <InfoRow label="Quán chi" value={proposal.shop?.name ?? "—"} />
            <InfoRow label="Người duyệt" value={proposal.approver?.name ?? "—"} />
            <InfoRow label="Người chi" value={EXPENSE_PAYER_LABEL[payer]} />
            <View style={styles.purpose}>
              <Text style={styles.infoLabel}>Mục đích sử dụng</Text>
              <Text style={styles.purposeText}>{proposal.purpose}</Text>
            </View>
          </CardBody>
        </Card>

        {status === "REJECTED" && proposal.rejectReason ? (
          <Notice tone="danger" title="Lý do từ chối" body={proposal.rejectReason} />
        ) : null}
        {status !== "REAPPROVAL" && proposal.revisionRejectReason ? (
          <Notice tone="warning" title="Bảng hạng mục bổ sung bị từ chối" body={proposal.revisionRejectReason} />
        ) : null}

        {hasMainActions ? (
          <View style={styles.actionGroup}>
            {canApprove || canDecideRevision ? (
              <View style={styles.actions}>
                <Button
                  title={canDecideRevision ? "Từ chối bổ sung" : "Từ chối"}
                  variant="danger"
                  style={styles.actionButton}
                  disabled={busy}
                  onPress={() => setRejectScope(canDecideRevision ? "revision" : "proposal")}
                />
                <Button
                  title={canDecideRevision ? "Duyệt bổ sung" : "Duyệt"}
                  style={styles.actionButton}
                  loading={decide.isPending}
                  onPress={() => confirmApprove(canDecideRevision ? "revision" : "proposal")}
                />
              </View>
            ) : null}
            {canFirstAdvance || canAdvanceMore || canComplete ? (
              <View style={styles.actions}>
                {canFirstAdvance || canAdvanceMore ? (
                  <Button
                    title={canFirstAdvance ? "Tạm ứng" : "Tạm ứng thêm"}
                    style={styles.actionButton}
                    disabled={busy}
                    icon={<Ionicons name="wallet-outline" size={16} color={colors.onPrimary} />}
                    onPress={() => setAdvancing(true)}
                  />
                ) : null}
                {canComplete ? (
                  <Button
                    title="Hoàn thành"
                    style={styles.actionButton}
                    disabled={busy}
                    icon={<Ionicons name="checkmark-done" size={16} color={colors.onPrimary} />}
                    onPress={() => router.push(`/expense-proposals/${proposal.id}/complete`)}
                  />
                ) : null}
              </View>
            ) : null}
            {canRevise ? (
              <Button
                title="Thêm hạng mục chi dự kiến"
                variant="secondary"
                fullWidth
                disabled={busy}
                icon={<Ionicons name="list-outline" size={16} color={colors.text} />}
                onPress={() => router.push(`/expense-proposals/${proposal.id}/revision`)}
              />
            ) : null}
          </View>
        ) : null}

        {status === "REAPPROVAL" ? (
          <ItemsCard
            title="Hạng mục dự kiến đề nghị bổ sung"
            subtitle={`Tổng hiện tại ${formatCurrency(total)} → đề nghị ${formatCurrency(proposal.pendingTotal ?? 0)}. Chỉ thay bảng hiện tại khi được duyệt.`}
            items={proposal.pendingItems ?? []}
            total={proposal.pendingTotal ?? 0}
            totalLabel="Tổng đề nghị"
          />
        ) : null}

        <ItemsCard title="Hạng mục chi dự kiến" items={proposal.items ?? []} total={total} totalLabel="Tổng dự kiến" />

        {hasAdvanceFlow || spent !== null || proposal.invoiceDueDate ? (
          <Card>
            <CardHeader>
              <CardTitle>{hasAdvanceFlow ? "Tạm ứng & quyết toán" : "Quyết toán"}</CardTitle>
            </CardHeader>
            <CardBody style={styles.infoCard}>
              {proposal.advanceAmount != null ? (
                <InfoRow label="Đề nghị tạm ứng" value={formatCurrency(proposal.advanceAmount)} />
              ) : null}
              {(proposal.advances ?? []).map((a, index) => (
                <InfoRow
                  key={a.id}
                  label={`Lần ${index + 1} · ${formatDateVN(a.createdAt)}`}
                  value={`${formatCurrency(a.amount)}${a.createdBy?.name ? ` · ${a.createdBy.name}` : ""}`}
                />
              ))}
              {hasAdvanceFlow ? <InfoRow label="Tổng đã tạm ứng" value={formatCurrency(advanced)} strong /> : null}
              {hasAdvanceFlow && status !== "SPENT" ? <InfoRow label="Còn được ứng" value={formatCurrency(remaining)} /> : null}
              {proposal.invoiceDueDate ? (
                <InfoRow label="Ngày trả hoá đơn dự kiến" value={formatDateOnly(proposal.invoiceDueDate)} />
              ) : null}
              {spent !== null ? <InfoRow label="Tổng tiền đã chi" value={formatCurrency(spent)} strong /> : null}
              {proposal.invoiceDate ? <InfoRow label="Ngày nộp hoá đơn" value={formatDateOnly(proposal.invoiceDate)} /> : null}
              {settlement !== null && settlement !== 0 ? (
                <InfoRow
                  label={settlement > 0 ? "Người lập phải hoàn lại" : "Phải chi bù cho người lập"}
                  value={formatCurrency(Math.abs(settlement))}
                  strong
                />
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {status === "SPENT" ? (
          (proposal.spentItems ?? []).length > 0 ? (
            <ItemsCard title="Hạng mục chi thực tế" items={proposal.spentItems ?? []} total={spent ?? 0} totalLabel="Tổng đã chi" />
          ) : (
            // Phiếu hoàn thành trước khi có bước khai thực chi thì không có dòng nào.
            <Notice tone="neutral" title="Hạng mục chi thực tế" body="Phiếu hoàn thành trước khi có bước khai hạng mục thực chi." />
          )
        ) : null}

        {status === "SPENT" ? (
          <ExpenseProposalImagesCard
            proposalId={proposal.id}
            imageCount={proposal._count?.images ?? 0}
            canManage={can("EXPENSE_PROPOSALS", "COMPLETE")}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử xử lý</CardTitle>
          </CardHeader>
          <CardBody style={styles.history}>
            {historyOf(proposal).map((step) => (
              <View key={step.key} style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={styles.historyText}>
                  <Text style={styles.historyLabel}>
                    {step.label}
                    {step.by ? ` · ${step.by}` : ""}
                  </Text>
                  {step.at ? <Text style={styles.historyTime}>{formatDateVN(step.at)}</Text> : null}
                </View>
              </View>
            ))}
          </CardBody>
        </Card>

        {status === "PENDING" && (can("EXPENSE_PROPOSALS", "EDIT") || can("EXPENSE_PROPOSALS", "DELETE")) ? (
          <View style={styles.actions}>
            {can("EXPENSE_PROPOSALS", "EDIT") ? (
              <Button
                title="Sửa"
                variant="secondary"
                style={styles.actionButton}
                disabled={busy}
                icon={<Ionicons name="pencil" size={16} color={colors.text} />}
                onPress={() => router.push(`/expense-proposals/${proposal.id}/edit`)}
              />
            ) : null}
            {can("EXPENSE_PROPOSALS", "DELETE") ? (
              <Button
                title="Xoá"
                variant="secondary"
                style={styles.actionButton}
                disabled={busy}
                icon={<Ionicons name="trash-outline" size={16} color={colors.danger} />}
                onPress={confirmDelete}
              />
            ) : null}
          </View>
        ) : null}
      </Screen>

      <Modal
        visible={rejectScope !== null}
        title={rejectScope === "revision" ? "Từ chối bảng bổ sung" : "Từ chối phiếu"}
        onClose={() => setRejectScope(null)}
        footer={<Button title="Từ chối" variant="danger" fullWidth loading={decide.isPending} onPress={submitReject} />}
      >
        <View style={styles.rejectForm}>
          <Input
            label="Lý do từ chối"
            required
            value={reason}
            onChangeText={(value) => {
              setReason(value);
              setReasonError(null);
            }}
            error={reasonError ?? undefined}
            hint={rejectScope === "revision" ? "Bảng hạng mục hiện tại được giữ nguyên, phiếu quay về trạng thái trước." : undefined}
            multiline
            autoFocus
          />
        </View>
      </Modal>

      {advancing ? (
        <ExpenseAdvanceModal
          proposalId={proposal.id}
          isFirst={canFirstAdvance}
          initialAmount={canFirstAdvance && proposal.advanceAmount != null ? Math.min(Number(proposal.advanceAmount), remaining) : null}
          remaining={remaining}
          onClose={() => setAdvancing(false)}
          onError={(err) => {
            setAdvancing(false);
            refetchOnConflict(err);
          }}
        />
      ) : null}
    </>
  );
}

function ItemsCard({
  title,
  subtitle,
  items,
  total,
  totalLabel,
}: {
  title: string;
  subtitle?: string;
  items: (ExpenseProposalItem | ExpenseProposalPendingItem)[];
  total: string | number;
  totalLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Text style={styles.count}>{items.length} dòng</Text>
      </CardHeader>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {items.map((item, index) => (
        <View key={"id" in item ? item.id : index} style={styles.itemRow}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName}>
              {index + 1}. {item.content}
            </Text>
            <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
          </View>
          <Text style={styles.itemMeta}>
            {formatNumber(item.quantity)}
            {item.unit ? ` ${item.unit}` : ""} × {formatCurrency(item.unitPrice)}
          </Text>
          {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
        </View>
      ))}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>{totalLabel}</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>
    </Card>
  );
}

function Notice({ tone, title, body }: { tone: "danger" | "warning" | "neutral"; title: string; body: string }) {
  const palette = {
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: "close-circle" as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: "alert-circle" as const },
    neutral: { bg: colors.neutralSoft, fg: colors.textMuted, icon: "information-circle" as const },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      <Ionicons name={palette.icon} size={20} color={palette.fg} />
      <View style={styles.noticeText}>
        <Text style={[styles.noticeTitle, { color: palette.fg }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, strong && styles.infoStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: { paddingTop: spacing.lg, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  code: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: "right", fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  infoStrong: { fontSize: fontSize.md, fontWeight: "700" },
  purpose: { marginTop: spacing.sm, gap: 4 },
  purposeText: { fontSize: fontSize.md, color: colors.text, lineHeight: 21 },
  notice: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  noticeText: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: fontSize.sm, fontWeight: "700" },
  noticeBody: { fontSize: fontSize.md, color: colors.text },
  actionGroup: { gap: spacing.md },
  actions: { flexDirection: "row", gap: spacing.md },
  actionButton: { flex: 1 },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
  subtitle: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, fontSize: fontSize.sm, color: colors.textMuted },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  itemName: { flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemAmount: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  itemMeta: { fontSize: fontSize.sm, color: colors.textMuted },
  itemNote: { fontSize: fontSize.xs, color: colors.textFaint },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.subtle,
  },
  totalLabel: { fontSize: fontSize.md, fontWeight: "600", color: colors.textMuted },
  totalValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  history: { gap: spacing.md, paddingTop: spacing.xs },
  historyRow: { flexDirection: "row", gap: spacing.md },
  historyDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 5 },
  historyText: { flex: 1, gap: 2 },
  historyLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  historyTime: { fontSize: fontSize.xs, color: colors.textMuted },
  rejectForm: { padding: spacing.lg },
});
