import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/ui/Button";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export function StartupScreen({
  checkingSession,
  failed,
  onRetry,
}: {
  checkingSession: boolean;
  failed: boolean;
  onRetry: () => Promise<unknown>;
}) {
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    Keyboard.dismiss();
    const timer = setTimeout(() => setSlow(true), 20_000);
    return () => clearTimeout(timer);
  }, [attempt]);

  function retry() {
    setSlow(false);
    setAttempt((value) => value + 1);
    // Trạng thái lỗi do query quản lý; không cập nhật state sau khi màn chờ đã đóng.
    void onRetry().catch(() => undefined);
  }

  return (
    <SafeAreaView style={styles.root} accessibilityViewIsModal>
      <View style={styles.content}>
        <View style={styles.logo}>
          <Ionicons name="cube" size={52} color={colors.primary} />
        </View>
        <Text style={styles.title}>Quản lý kho</Text>
        <View style={styles.status} accessibilityLiveRegion="polite">
          {!failed ? <ActivityIndicator size="large" color={colors.primary} /> : null}
          <Text style={styles.message}>
            {failed
              ? "Chưa tải được dữ liệu. Vui lòng kiểm tra kết nối mạng và thử lại."
              : checkingSession ? "Đang kiểm tra đăng nhập…" : "Đang tải dữ liệu trang chủ…"}
          </Text>
          {slow && !failed ? <Text style={styles.hint}>Kết nối đang chậm, bạn có thể chờ thêm hoặc thử lại.</Text> : null}
          {failed || slow ? <Button title="Thử lại" onPress={retry} fullWidth /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  content: { width: "100%", maxWidth: 360, padding: spacing.xxl, alignItems: "center", gap: spacing.xl },
  logo: { width: 104, height: 104, borderRadius: radius.xl, backgroundColor: colors.primarySoft, justifyContent: "center", alignItems: "center" },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  status: { alignSelf: "stretch", alignItems: "center", gap: spacing.lg },
  message: { fontSize: fontSize.md, lineHeight: 23, textAlign: "center", color: colors.textMuted },
  hint: { fontSize: fontSize.sm, lineHeight: 21, textAlign: "center", color: colors.textMuted },
});
