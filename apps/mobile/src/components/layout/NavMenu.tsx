import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { hasPermission } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { AuthUser } from "@/types";
import type { NavItem, NavSection } from "./navConfig";

/**
 * Menu dạng thẻ dùng cho tab Nghiệp vụ và tab Báo cáo. Mục thiếu quyền bị ẩn hẳn, nhóm rỗng cũng
 * ẩn theo — giống Sidebar bên web. Mục chưa có `href` (màn hình chưa dựng) vẫn hiện kèm nhãn
 * "Sắp có" nhưng không bấm được, để người dùng thấy chức năng đó sẽ có chứ không tưởng là bị mất quyền.
 */
export function NavMenu({ sections, user }: { sections: NavSection[]; user: AuthUser | null | undefined }) {
  const visible = sections
    .map((section) => ({ ...section, items: section.items.filter((item) => hasPermission(user, item.permission)) }))
    .filter((section) => section.items.length > 0);

  if (visible.length === 0) {
    return (
      <Card>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Tài khoản chưa được cấp quyền vào mục nào.</Text>
        </View>
      </Card>
    );
  }

  return (
    <>
      {visible.map((section) => (
        <View key={section.label} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name={section.icon} size={16} color={colors.textMuted} />
            <Text style={styles.sectionLabel}>{section.label}</Text>
          </View>
          <Card>
            {section.items.map((item, index) => (
              <MenuRow key={item.label} item={item} first={index === 0} />
            ))}
          </Card>
        </View>
      ))}
    </>
  );
}

function MenuRow({ item, first }: { item: NavItem; first: boolean }) {
  const router = useRouter();
  const href = item.href;
  const disabled = !href;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => href && router.push(href)}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={item.icon} size={17} color={disabled ? colors.textFaint : colors.primary} />
      </View>
      <Text style={[styles.rowLabel, disabled && styles.rowLabelDisabled]} numberOfLines={1}>
        {item.label}
      </Text>
      {disabled ? (
        <View style={styles.soon}>
          <Text style={styles.soonText}>Sắp có</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs },
  sectionLabel: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  // Hàng gọn ~48pt: đủ vùng chạm theo hướng dẫn của cả iOS lẫn Android mà danh sách vẫn thấp,
  // nhìn sát nhau như một bảng chứ không rời rạc như các thẻ lớn.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.subtle },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  rowLabelDisabled: { color: colors.textFaint },
  soon: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralSoft,
  },
  soonText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: "600" },
  empty: { padding: spacing.lg },
  emptyText: { fontSize: fontSize.sm, color: colors.textMuted },
});
