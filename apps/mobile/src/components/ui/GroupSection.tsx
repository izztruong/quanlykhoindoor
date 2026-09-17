import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { colors, fontSize, spacing } from "@/lib/theme";

interface GroupSectionProps {
  label: string;
  /** Tổng số mục trong nhóm. */
  count: number;
  /** Số mục đã nhập số liệu — hiện để người kiểm biết còn sót nhóm nào. */
  filledCount?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Khối gập được. Bản web bày mọi bảng ra cùng lúc; trên điện thoại làm vậy thì hàng trăm ô nhập
 * đều mounted và cuộn giật, nên chỉ nhóm đang mở mới dựng nội dung.
 */
export function GroupSection({ label, count, filledCount, open, onToggle, children }: GroupSectionProps) {
  return (
    <Card>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.meta}>{filledCount ? `Đã nhập ${filledCount}/${count}` : `${count} mục`}</Text>
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textFaint} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: { opacity: 0.7 },
  titleWrap: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.xs, color: colors.textMuted },
  body: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
