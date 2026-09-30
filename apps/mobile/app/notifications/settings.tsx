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

/**
 * Chỉ báo đúng một chuyện người dùng xử lý được: máy đang chặn thông báo. Các trạng thái kỹ thuật
 * (đang bật, chạy trong Expo Go, app chưa gắn dự án Expo) cố ý KHÔNG hiện lên giao diện — soi lỗi
 * push bằng log server, xem `console.error("[notifications] …")` trong notifications.service.ts.
 */
function DeviceStatus() {
  const availability = pushAvailability();
  const [permission, setPermission] = useState<PermissionState>("checking");

  const check = useCallback(async () => {
    const status = await Notifications.getPermissionsAsync();
    setPermission(status.granted ? "granted" : "denied");
  }, []);

  useEffect(() => {
    if (availability !== "available") return;
    check();
    // Người dùng thường bấm "Mở cài đặt" rồi quay lại — kiểm lại ngay khi app trở về foreground, và
    // ghi token luôn: quyền vừa được cấp KHÔNG tự động nghĩa là server đã có token của máy này.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        check();
        registerPushToken().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [availability, check]);

  if (availability !== "available" || permission !== "denied") return null;

  return (
    <StatusCard
      icon="notifications-off"
      title="Thông báo đang bị tắt trên điện thoại"
      text="Bạn sẽ không thấy thông báo trên thanh thông báo cho tới khi bật lại trong cài đặt của máy."
      action={<Button title="Mở cài đặt điện thoại" size="sm" onPress={() => Linking.openSettings()} />}
    />
  );
}

function StatusCard({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  const bg = colors.dangerSoft;
  const fg = colors.danger;
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
