import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { ExpenseProposalForm } from "@/components/expenseProposals/ExpenseProposalForm";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useExpenseProposal } from "@/hooks/useExpenseProposals";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function EditExpenseProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const proposal = useExpenseProposal(id ?? "");

  return (
    <>
      <Stack.Screen options={{ title: "Sửa phiếu đề xuất chi" }} />
      {proposal.isLoading ? (
        <LoadingState />
      ) : !proposal.data ? (
        <ErrorState message="Không tìm thấy phiếu đề xuất chi." />
      ) : proposal.data.status !== "PENDING" ? (
        // Chặn sớm như bên web: phiếu đã được xử lý thì server trả 409, đừng để người dùng gõ xong mới biết.
        <View style={styles.locked}>
          <Text style={styles.lockedText}>Phiếu {proposal.data.code} đã được xử lý, không sửa được nữa.</Text>
        </View>
      ) : (
        <ExpenseProposalForm existing={proposal.data} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  locked: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  lockedText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: "center" },
});
