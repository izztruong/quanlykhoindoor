import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, radius, shadow, spacing } from "@/lib/theme";
import { subscribeToasts, type ToastMessage } from "@/lib/toastBus";

/**
 * Hiện ở mép trên vì thanh tab nổi đã chiếm mép dưới. Đặt một lần ở layout gốc; mọi mutation đẩy
 * thông báo qua toastBus (xem queryClient.tsx).
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { top: insets.top + spacing.sm }]}>
      {toasts.map((toast) => (
        <View key={toast.id} style={styles.toast}>
          <Ionicons
            name={toast.type === "success" ? "checkmark-circle" : "alert-circle"}
            size={20}
            color={toast.type === "success" ? colors.success : colors.danger}
          />
          <Text style={styles.text} numberOfLines={3}>
            {toast.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", left: spacing.lg, right: spacing.lg, gap: spacing.sm, zIndex: 100 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.floating,
  },
  text: { flex: 1, fontSize: fontSize.sm, color: colors.text },
});
