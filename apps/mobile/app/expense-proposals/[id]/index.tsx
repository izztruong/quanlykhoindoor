import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import {
  type ExpenseProposalAction,
  useDeleteExpenseProposal,
  useExpenseProposal,
  useExpenseProposalAction,
} from "@/hooks/useExpenseProposals";
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
import type { ExpenseProposal } from "@/types";

const CONFIRM: Record<Exclude<ExpenseProposalAction, "reject">, { title: string; message: string; button: string }> = {
  approve: { title: "Duyệt phiếu", message: "Duyệt phiếu đề xuất chi này?", button: "Duyệt" },
  advance: { title: "Đã tạm ứng", message: "Xác nhận đã tạm ứng tiền cho phiếu này?", button: "Xác nhận" },
  spend: { title: "Đã chi", message: "Xác nhận đã chi tiền cho phiếu này?", button: "Xác nhận" },
};

/** Các mốc đã xảy ra của phiếu, theo thứ tự — giống historyOf bên web. */
function historyOf(p: ExpenseProposal) {
  const steps: { label: string; by?: string; at?: string | null }[] = [
    { label: "Lập phiếu", by: p.createdBy?.name, at: p.createdAt },
  ];
  if (p.approvedAt) {
    steps.push({ label: p.status === "REJECTED" ? "Từ chối" : "Duyệt", by: p.approvedBy?.name, at: p.approvedAt });
  }
  if (p.advancedAt) steps.push({ label: "Đã tạm ứng", by: p.advancedBy?.name, at: p.advancedAt });
  if (p.spentAt) steps.push({ label: "Đã chi", by: p.spentBy?.name, at: p.spentAt });
  return steps;
}

export default function ExpenseProposalDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();
  const { can } = useCan();
  const { data: proposal, isLoading, isRefetching, refetch } = useExpenseProposal(id);
  const runAction = useExpenseProposalAction(id);
  const deleteProposal = useDeleteExpenseProposal();
  const [rejecting, setRejecting] = useState(false);
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
  const isPending = status === "PENDING";
  const canApprove = isPending && can("EXPENSE_PROPOSALS", "APPROVE");
  const canAdvance = status === "APPROVED" && proposal.advanceAmount != null && can("EXPENSE_PROPOSALS", "PAY");
  const canSpend =
    ((status === "APPROVED" && proposal.advanceAmount == null) || status === "ADVANCED") &&
    can("EXPENSE_PROPOSALS", "PAY");
  const busy = runAction.isPending || deleteProposal.isPending;

  /**
   * 409 nghĩa là phiếu vừa được người khác xử lý (hai người bấm cùng lúc) hoặc không còn chờ duyệt.
   * Toast lỗi đã hiện ở MutationCache; tải lại để màn hình khớp trạng thái thật và các nút tự đổi.
   */
  function refetchOnConflict(err: unknown) {
    if (err instanceof ApiError && err.status === 409) refetch();
  }

  function confirmAction(action: Exclude<ExpenseProposalAction, "reject">) {
    const { title, message, button } = CONFIRM[action];
    Alert.alert(title, message, [
      { text: "Huỷ", style: "cancel" },
      { text: button, onPress: () => runAction.mutate({ action }, { onError: refetchOnConflict }) },
    ]);
  }

  function submitReject() {
    if (!reason.trim()) {
      setReasonError("Vui lòng nhập lý do từ chối.");
      return;
    }
    runAction.mutate(
      { action: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          setRejecting(false);
          setReason("");
          setReasonError(null);
        },
        onError: (err) => {
          setRejecting(false);
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
        onPress: () =>
          deleteProposal.mutate(id, {
            onSuccess: () => router.back(),
            onError: refetchOnConflict,
          }),
      },
    ]);
  }

  const items = proposal.items ?? [];

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
            <InfoRow
              label="Loại phiếu"
              value={proposal.category ? EXPENSE_PROPOSAL_CATEGORY_LABEL[proposal.category] : "—"}
            />
            <InfoRow label="Người lập" value={proposal.createdBy?.name ?? "—"} />
            <InfoRow label="Quán chi" value={proposal.shop?.name ?? "—"} />
            <InfoRow label="Người xác nhận" value={proposal.approver?.name ?? "—"} />
            <InfoRow label="Người chi" value={EXPENSE_PAYER_LABEL[payer]} />
            <View style={styles.purpose}>
              <Text style={styles.infoLabel}>Mục đích sử dụng</Text>
              <Text style={styles.purposeText}>{proposal.purpose}</Text>
            </View>
          </CardBody>
        </Card>

        {status === "REJECTED" && proposal.rejectReason ? (
          <View style={styles.rejectBox}>
            <Ionicons name="close-circle" size={20} color={colors.danger} />
            <View style={styles.rejectText}>
              <Text style={styles.rejectTitle}>Lý do từ chối</Text>
              <Text style={styles.rejectBody}>{proposal.rejectReason}</Text>
            </View>
          </View>
        ) : null}

        {canApprove || canAdvance || canSpend ? (
          <View style={styles.actions}>
            {canApprove ? (
              <>
                <Button
                  title="Từ chối"
                  variant="danger"
                  style={styles.actionButton}
                  disabled={busy}
                  onPress={() => setRejecting(true)}
                />
                <Button
                  title="Duyệt"
                  style={styles.actionButton}
                  loading={runAction.isPending}
                  onPress={() => confirmAction("approve")}
                />
              </>
            ) : null}
            {canAdvance ? (
              <Button
                title="Đã tạm ứng"
                style={styles.actionButton}
                loading={runAction.isPending}
                onPress={() => confirmAction("advance")}
              />
            ) : null}
            {canSpend ? (
              <Button
                title="Đã chi"
                style={styles.actionButton}
                loading={runAction.isPending}
                onPress={() => confirmAction("spend")}
              />
            ) : null}
          </View>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Hạng mục chi</CardTitle>
            <Text style={styles.count}>{items.length} dòng</Text>
          </CardHeader>
          {items.map((item, index) => (
            <View key={item.id} style={styles.itemRow}>
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
            <Text style={styles.totalLabel}>Tổng tiền</Text>
            <Text style={styles.totalValue}>{formatCurrency(proposal.totalAmount)}</Text>
          </View>
        </Card>

        {proposal.advanceAmount != null ? (
          <Card>
            <CardHeader>
              <CardTitle>Tạm ứng</CardTitle>
            </CardHeader>
            <CardBody style={styles.infoCard}>
              <InfoRow
                label="Tạm ứng"
                value={proposal.advancePercent != null ? `${formatNumber(proposal.advancePercent)}%` : "—"}
              />
              <InfoRow
                label="Số tiền tạm ứng"
                value={proposal.advanceAmount != null ? formatCurrency(proposal.advanceAmount) : "—"}
              />
              <InfoRow
                label="Ngày trả hoá đơn"
                value={proposal.invoiceDueDate ? formatDateOnly(proposal.invoiceDueDate) : "—"}
              />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử xử lý</CardTitle>
          </CardHeader>
          <CardBody style={styles.history}>
            {historyOf(proposal).map((step) => (
              <View key={step.label} style={styles.historyRow}>
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

        {isPending && (can("EXPENSE_PROPOSALS", "EDIT") || can("EXPENSE_PROPOSALS", "DELETE")) ? (
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
        visible={rejecting}
        title="Từ chối phiếu"
        onClose={() => setRejecting(false)}
        footer={<Button title="Từ chối" variant="danger" fullWidth loading={runAction.isPending} onPress={submitReject} />}
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
            multiline
            autoFocus
          />
        </View>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  purpose: { marginTop: spacing.sm, gap: 4 },
  purposeText: { fontSize: fontSize.md, color: colors.text, lineHeight: 21 },
  rejectBox: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
  },
  rejectText: { flex: 1, gap: 2 },
  rejectTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.danger },
  rejectBody: { fontSize: fontSize.md, color: colors.text },
  actions: { flexDirection: "row", gap: spacing.md },
  actionButton: { flex: 1 },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
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
