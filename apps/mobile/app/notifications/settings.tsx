import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useNotificationPreferences, useUpdateNotificationPreference } from "@/hooks/useNotifications";
import { Notifications, pushAvailability, registerPushToken } from "@/lib/pushNotifications";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { pushToast } from "@/lib/toastBus";
import type { NotificationPreference } from "@/types";

type PermissionState = "checking" | "granted" | "denied";

/**
 * Mỗi người tự bật/tắt loại thông báo mình nhận. Server chỉ trả những loại người này có khả năng
 * nhận (theo quyền) nên không cần lọc lại ở đây.
 */
export default function NotificationSettingsScreen() {
  const preferences = useNotificationPreferences();
  const update = useUpdateNotificationPreference();

  const groups = new Map<string, NotificationPreference[]>();
  for (const item of preferences.data ?? []) {
    groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  }

  return (
    <>
      <Stack.Screen options={{ title: "Cài đặt thông báo" }} />
      <Screen refreshing={preferences.isRefetching} onRefresh={() => preferences.refetch()}>
        <DeviceStatus />

        {preferences.isLoading ? (
          <LoadingState />
        ) : preferences.isError ? (
          <ErrorState message="Không tải được cài đặt thông báo." />
        ) : groups.size === 0 ? (
          <Card>
            <Text style={styles.empty}>Tài khoản của bạn hiện chưa thuộc diện nhận loại thông báo nào.</Text>
          </Card>
        ) : (
          [...groups.entries()].map(([group, items]) => (
            <View key={group} style={styles.section}>
              <Text style={styles.sectionLabel}>{group}</Text>
              <Card>
                {items.map((item, index) => (
                  <View key={item.type} style={[styles.row, index > 0 && styles.rowDivider]}>
                    <View style={styles.rowText}>
                      <Text style={styles.label}>{item.label}</Text>
                      <Text style={styles.description}>{item.description}</Text>
                    </View>
                    <Switch
                      value={item.enabled}
                      onValueChange={(enabled) => update.mutate({ type: item.type, enabled })}
                      trackColor={{ true: colors.primary, false: colors.borderStrong }}
                      accessibilityLabel={item.label}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}

        <Text style={styles.footnote}>
          Tắt một loại thì bạn không nhận thông báo đó nữa, kể cả trong danh sách Thông báo. Người khác không bị ảnh
          hưởng.
        </Text>
      </Screen>
    </>
  );
}

/** Khung trạng thái của chính chiếc máy: có nhận được thông báo đẩy không, và vì sao. */
function DeviceStatus() {
  const availability = pushAvailability();
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [registering, setRegistering] = useState(false);

  const check = useCallback(async () => {
    const status = await Notifications.getPermissionsAsync();
    setPermission(status.granted ? "granted" : "denied");
  }, []);

  /**
   * Quyền hệ điều hành đã cấp KHÔNG có nghĩa là token đã ghi được lên server — hai chuyện khác
   * nhau (lấy token từ Expo có thể lỗi vì thiếu khoá FCM, hoặc gửi lên server có thể lỗi mạng).
   * `announce` bật khi bấm nút thử lại thủ công; tắt khi tự chạy lúc quay về foreground, để không
   * bắn toast mỗi lần mở lại app.
   */
  const retryRegister = useCallback(async (announce: boolean) => {
    if (announce) setRegistering(true);
    try {
      await registerPushToken();
      if (announce) pushToast("success", "Đã đăng ký thông báo cho máy này");
    } catch (err) {
      if (announce) pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      if (announce) setRegistering(false);
    }
  }, []);

  useEffect(() => {
    if (availability !== "available") return;
    check();
    // Người dùng thường bấm "Mở cài đặt" rồi quay lại — kiểm lại ngay khi app trở về foreground.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
        retryRegister(false);
      }
    });
    return () => sub.remove();
  }, [availability, check, retryRegister]);

  if (availability === "expo-go") {
    return (
      <StatusCard
        tone="warning"
        icon="information-circle"
        title="Đang chạy trong Expo Go"
        text="Expo Go trên Android không nhận được thông báo đẩy. Cần cài bản riêng của app để thông báo hiện lên thanh thông báo. Cài đặt bên dưới vẫn được lưu."
      />
    );
  }

  if (availability === "not-configured") {
    return (
      <StatusCard
        tone="warning"
        icon="construct"
        title="App chưa cấu hình thông báo đẩy"
        text="Bản app này chưa gắn dự án Expo nên không nhận được thông báo đẩy."
      />
    );
  }

  if (permission === "checking") return null;

  if (permission === "denied") {
    return (
      <StatusCard
        tone="danger"
        icon="notifications-off"
        title="Thông báo đang bị tắt trên điện thoại"
        text="Bạn sẽ không thấy thông báo trên thanh thông báo cho tới khi bật lại trong cài đặt của máy."
        action={<Button title="Mở cài đặt điện thoại" size="sm" onPress={() => Linking.openSettings()} />}
      />
    );
  }

  return (
    <StatusCard
      tone="success"
      icon="notifications"
      title="Thông báo đang bật trên máy này"
      text="Thông báo sẽ hiện lên thanh thông báo kể cả khi app đang đóng."
      action={
        <Button
          title="Thử đăng ký lại"
          size="sm"
          variant="secondary"
          loading={registering}
          onPress={() => retryRegister(true)}
        />
      }
    />
  );
}

const TONES = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
} as const;

function StatusCard({
  tone,
  icon,
  title,
  text,
  action,
}: {
  tone: keyof typeof TONES;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.status, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={22} color={fg} />
      <View style={styles.statusText}>
        <Text style={[styles.statusTitle, { color: fg }]}>{title}</Text>
        <Text style={styles.statusBody}>{text}</Text>
        {action ? <View style={styles.statusAction}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: fontSize.md, color: colors.text, fontWeight: "600" },
  description: { fontSize: fontSize.sm, color: colors.textMuted },
  empty: { padding: spacing.lg, fontSize: fontSize.sm, color: colors.textMuted },
  footnote: { fontSize: fontSize.xs, color: colors.textFaint, paddingHorizontal: spacing.xs },
  status: { flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg },
  statusText: { flex: 1, gap: 4 },
  statusTitle: { fontSize: fontSize.md, fontWeight: "700" },
  statusBody: { fontSize: fontSize.sm, color: colors.text, lineHeight: 19 },
  statusAction: { marginTop: spacing.sm, alignSelf: "flex-start" },
});
