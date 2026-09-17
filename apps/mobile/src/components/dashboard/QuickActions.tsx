import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { quickActions } from "@/components/layout/navConfig";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** Lưới lối tắt ở trang chủ. Mục nào người dùng không có quyền thì không hiện. */
export function QuickActions() {
  const router = useRouter();
  const { user } = useCan();

  const items = quickActions.filter((item) => {
    const [resource, action] = item.permission.split(".");
    return user?.isSystem || user?.permissions.includes(`${resource}.${action}`);
  });

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thao tác nhanh</CardTitle>
      </CardHeader>
      <View style={styles.grid}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <View style={styles.icon}>
              <Ionicons name={item.icon} size={24} color={colors.primary} />
            </View>
            <Text style={styles.label} numberOfLines={2}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  // 4 cột: mỗi ô 25% bề ngang, nhãn xuống dòng thay vì bóp chữ.
  item: { width: "25%", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  pressed: { opacity: 0.6 },
  icon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: "center", lineHeight: 15 },
});
