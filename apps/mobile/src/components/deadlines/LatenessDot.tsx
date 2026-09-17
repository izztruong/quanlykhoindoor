import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/lib/theme";

interface LatenessDotProps {
  /** null = bản ghi chưa từng được đánh giá hạn (tạo trước khi có lịch) → chấm xám, không phải xanh. */
  dueAt?: string | null;
  isLate?: boolean;
  /** Hiện chữ bên cạnh chấm; danh sách dày thì tắt đi cho gọn. */
  showLabel?: boolean;
}

export function LatenessDot({ dueAt, isLate, showLabel = true }: LatenessDotProps) {
  const state = !dueAt ? "unknown" : isLate ? "late" : "onTime";
  const color = state === "unknown" ? colors.textFaint : state === "late" ? colors.danger : colors.success;
  const label = state === "unknown" ? "Chưa tính hạn" : state === "late" ? "Nộp muộn" : "Đúng hạn";

  return (
    <View style={styles.root}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {showLabel ? <Text style={[styles.label, { color }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: fontSize.xs, fontWeight: "600" },
});
