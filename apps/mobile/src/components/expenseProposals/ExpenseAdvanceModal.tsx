import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAdvanceExpenseProposal } from "@/hooks/useExpenseProposals";
import { formatCurrency } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface ExpenseAdvanceModalProps {
  proposalId: string;
  /** Lần đầu thì điền sẵn số người lập đề nghị; tạm ứng thêm thì để trống. */
  initialAmount: number | null;
  /** Tổng dự kiến − tổng đã ứng. Server vẫn là nơi chốt trần, đây chỉ để báo sớm. */
  remaining: number;
  isFirst: boolean;
  onClose: () => void;
  /** Gọi khi server trả lỗi — màn chi tiết tải lại nếu là 409 (phiếu vừa đổi trạng thái). */
  onError: (err: unknown) => void;
}

/** Tấm trượt nhập số tiền tạm ứng — cùng luật với ExpenseAdvanceModal bên web. */
export function ExpenseAdvanceModal({ proposalId, initialAmount, remaining, isFirst, onClose, onError }: ExpenseAdvanceModalProps) {
  const advance = useAdvanceExpenseProposal(proposalId);
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const value = amount.trim() === "" ? null : Number(amount);
    if (value === null || Number.isNaN(value) || !(value > 0)) return setError("Số tiền tạm ứng phải lớn hơn 0.");
    if (value > remaining) return setError(`Tổng tạm ứng không được vượt tổng dự kiến — còn được ứng ${formatCurrency(remaining)}.`);
    advance.mutate({ amount: value, note: note.trim() || undefined }, { onSuccess: onClose, onError });
  }

  return (
    <Modal
      visible
      title={isFirst ? "Tạm ứng" : "Tạm ứng thêm"}
      onClose={onClose}
      footer={<Button title="Xác nhận tạm ứng" fullWidth loading={advance.isPending} onPress={submit} />}
    >
      <View style={styles.body}>
        <View style={styles.remaining}>
          <Text style={styles.remainingLabel}>Còn được ứng</Text>
          <Text style={styles.remainingValue}>{formatCurrency(remaining)}</Text>
        </View>
        <Input
          label="Số tiền tạm ứng"
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          autoFocus
          error={error ?? undefined}
          hint={
            isFirst && initialAmount != null
              ? `Điền sẵn số người lập đề nghị (${formatCurrency(initialAmount)}) — sửa nếu ứng khác.`
              : undefined
          }
        />
        <Input label="Ghi chú" value={note} onChangeText={setNote} placeholder="Không bắt buộc" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  remaining: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  remainingLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  remainingValue: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
});
