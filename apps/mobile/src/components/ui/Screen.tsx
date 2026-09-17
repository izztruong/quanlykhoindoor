import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "@/lib/theme";

/** Chiều cao thanh tab nổi + khoảng hở, để nội dung cuộn hết mà không bị tab che. */
export const TAB_BAR_CLEARANCE = 96;

interface ScreenProps {
  children: React.ReactNode;
  /** Bọc trong ScrollView. Đặt false cho màn có FlatList riêng. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Thêm khoảng trống đáy cho thanh tab — bật ở các màn nằm trong tab. */
  withTabBar?: boolean;
}

export function Screen({ children, scroll = true, refreshing, onRefresh, withTabBar }: ScreenProps) {
  const padBottom = withTabBar ? TAB_BAR_CLEARANCE : spacing.xxl;

  if (!scroll) {
    return <View style={[styles.root, { paddingBottom: padBottom }]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: padBottom }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function LoadingState({ label = "Đang tải dữ liệu..." }: { label?: string }) {
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label = "Không có dữ liệu" }: { label?: string }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <View style={styles.state}>
      <Text style={[styles.stateText, styles.errorText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  state: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl * 2, gap: spacing.md },
  stateText: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: "center" },
  errorText: { color: colors.danger },
});
