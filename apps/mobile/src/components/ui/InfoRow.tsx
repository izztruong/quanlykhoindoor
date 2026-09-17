import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/lib/theme";

/** Không cắt dòng: ghi chú và tên dài phải đọc được trên màn chi tiết. */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  label: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted },
  value: { flex: 2, textAlign: "right", fontSize: fontSize.sm, color: colors.text },
});
