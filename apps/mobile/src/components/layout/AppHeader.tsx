import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnreadNotificationCount } from "@/hooks/useNotifications";
import { useCurrentUser } from "@/lib/auth";
import { colors, fontSize, headerGradient, radius, spacing } from "@/lib/theme";

/**
 * Dải đầu trang dùng chung cho các tab: chữ cái đầu của tên làm avatar, tên và vai trò. Vai trò
 * lấy từ `roleName` server trả về nên luôn khớp phân quyền thật.
 *
 * Nền chuyển màu đậm trên → nhạt dưới, điểm cuối trùng `colors.background` nên chỗ dải kết thúc
 * không để lại vệt cắt ngang; phần đuôi nhạt cố ý thò xuống dưới nội dung để tan dần vào trang.
 */
export function AppHeader({ title }: { title?: string }) {
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: unread = 0 } = useUnreadNotificationCount(Boolean(user));
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <LinearGradient colors={headerGradient} style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.primary} numberOfLines={1}>
          {title ?? (user?.name || user?.email) ?? ""}
        </Text>
        <Text style={styles.secondary} numberOfLines={1}>
          {user?.roleName ?? ""}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/notifications")}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        hitSlop={8}
        style={({ pressed }) => [styles.bell, pressed && styles.pressed]}
      >
        <Ionicons name="notifications" size={20} color={colors.primary} />
        {unread > 0 ? (
          <View style={styles.badge}>
            {/* Quá 99 thì chữ tràn ra ngoài chấm; con số chính xác đã có trong màn Thông báo. */}
            <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: fontSize.xl, fontWeight: "700", color: colors.primary },
  info: { flex: 1, gap: 2 },
  primary: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  secondary: { fontSize: fontSize.sm, color: colors.textMuted },
  bell: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.onPrimary },
});
