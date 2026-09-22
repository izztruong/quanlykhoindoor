import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  ExpenseItemsEditor,
  rowsFromItems,
  totalsOf,
  validateRows,
  type ItemRow,
} from "@/components/expenseProposals/ExpenseItemsEditor";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useExpenseProposal, useReviseExpenseProposal } from "@/hooks/useExpenseProposals";
import { formatCurrency } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpenseProposal } from "@/types";

export default function ExpenseProposalRevisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const proposal = useExpenseProposal(id ?? "");

  return (
    <>
      <Stack.Screen options={{ title: "Hạng mục chi dự kiến" }} />
      {proposal.isLoading ? (
        <LoadingState />
      ) : !proposal.data ? (
        <ErrorState message="Không tìm thấy phiếu đề xuất chi." />
      ) : proposal.data.status !== "APPROVED" && proposal.data.status !== "ADVANCED" ? (
        // Chặn sớm như bên web: server trả 409 nếu phiếu không ở Đã duyệt / Đã tạm ứng.
        <ErrorState message={`Phiếu ${proposal.data.code} không ở trạng thái cho phép thêm hạng mục chi dự kiến.`} />
      ) : (
        <RevisionForm proposal={proposal.data} />
      )}
    </>
  );
}

/** Sửa cả bảng hạng mục chi dự kiến rồi gửi người duyệt duyệt bổ sung. Bảng cũ giữ nguyên tới khi được duyệt. */
function RevisionForm({ proposal }: { proposal: ExpenseProposal }) {
  const router = useRouter();
  const revise = useReviseExpenseProposal(proposal.id);
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromItems(proposal.items));
  const [error, setError] = useState<string | null>(null);

  const { total } = totalsOf(rows);
  const currentTotal = Number(proposal.totalAmount);
  const advanced = (proposal.advances ?? []).reduce((sum, a) => sum + Number(a.amount), 0);

  function submit() {
    setError(null);
    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);
    if (total < advanced) return setError(`Tổng dự kiến mới không được nhỏ hơn số đã tạm ứng (${formatCurrency(advanced)}).`);
    revise.mutate(checked.items, { onSuccess: () => router.back() });
  }

  return (
    <Screen>
      <Text style={styles.hint}>
        Sửa, thêm hoặc xoá dòng. Bấm Lưu để gửi {proposal.approver?.name ?? "người duyệt"} duyệt bổ sung — bảng hiện tại
        vẫn giữ nguyên cho tới khi được duyệt.
      </Text>

      <ExpenseItemsEditor rows={rows} onChange={setRows} />

      <View style={styles.summary}>
        <SummaryRow label="Tổng hiện tại" value={formatCurrency(currentTotal)} />
        <SummaryRow label="Tổng mới" value={formatCurrency(total)} strong />
        {advanced > 0 ? <SummaryRow label="Đã tạm ứng" value={formatCurrency(advanced)} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Lưu & gửi duyệt" fullWidth loading={revise.isPending} onPress={submit} />
    </Screen>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  summary: { gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: fontSize.sm, color: colors.info },
  summaryValue: { fontSize: fontSize.md, fontWeight: "600", color: colors.info },
  summaryStrong: { fontSize: fontSize.lg, fontWeight: "700" },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: "center" },
});
