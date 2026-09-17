import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { DataList } from "@/components/ui/DataList";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadNotificationCount,
} from "@/hooks/useNotifications";
import { formatRelativeTime } from "@/lib/relativeTime";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { AppNotification, NotificationType } from "@/types";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TYPE_ICON: Record<NotificationType, IoniconName> = {
  ORDER_CREATED: "cart",
  ORDER_CONFIRMED: "checkmark-done",
  ORDER_SHORT: "alert-circle",
  ORDER_CANCELLED: "close-circle",
  EXPENSE_PROPOSAL_CREATED: "document-text",
  EXPENSE_PROPOSAL_DECIDED: "shield-checkmark",
  EXPENSE_PROPOSAL_PAID: "cash",
};

export default function NotificationsScreen() {
  const router = useRouter();
  const list = useNotificationList();
  const { data: unread = 0 } = useUnreadNotificationCount(true);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function open(item: AppNotification) {
    if (!item.readAt) markRead.mutate(item.id);
    // href do server dựng sẵn (vd "/orders/abc") — typedRoutes không biết trước chuỗi động này.
    if (item.href) router.push(item.href as Href);
  }

  const header =
    unread > 0 ? (
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>{unread} thông báo chưa đọc</Text>
        <Pressable
          onPress={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.readAll}>Đọc tất cả</Text>
        </Pressable>
      </View>
    ) : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Thông báo",
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/notifications/settings")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cài đặt thông báo"
            >
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <View style={styles.root}>
        <DataList
          data={list.items}
          header={header}
          keyExtractor={(item) => item.id}
          isLoading={list.isLoading}
          isRefetching={list.isRefetching}
          onRefresh={() => list.refetch()}
          onEndReached={list.loadMore}
          isFetchingMore={list.isFetchingNextPage}
          emptyMessage="Chưa có thông báo nào."
          renderItem={(item) => <NotificationRow item={item} onPress={() => open(item)} />}
        />
      </View>
    </>
  );
}

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const unread = !item.readAt;
  return (
    <Card style={unread ? styles.cardUnread : undefined}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={[styles.icon, unread && styles.iconUnread]}>
          <Ionicons name={TYPE_ICON[item.type]} size={18} color={unread ? colors.primary : colors.textFaint} />
        </View>
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            {unread ? <View style={styles.dot} /> : null}
          </View>
          <Text style={styles.body} numberOfLines={3}>
            {item.body}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  headerText: { fontSize: fontSize.sm, color: colors.textMuted },
  readAll: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  cardUnread: { borderWidth: 1, borderColor: colors.primarySoft },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  pressed: { opacity: 0.7 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  iconUnread: { backgroundColor: colors.primarySoft },
  content: { flex: 1, gap: 3 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1, fontSize: fontSize.md, color: colors.textMuted, fontWeight: "500" },
  titleUnread: { color: colors.text, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  body: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 19 },
  time: { fontSize: fontSize.xs, color: colors.textFaint, marginTop: 2 },
});
