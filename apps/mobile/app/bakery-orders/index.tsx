import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useUserOptions } from "@/hooks/useUsers";
import { BAKERY_ORDER_STATUS_LABEL, BAKERY_ORDER_STATUS_OPTIONS, BAKERY_ORDER_STATUS_TONE } from "@/lib/bakeryOrder";
import { formatDateOnly } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { AuthUser, BakeryOrder, BakeryOrderStatus } from "@/types";

/**
 * Mỗi vai trò mở danh sách ra là thấy ngay việc của mình — y như bản web: tiệm bánh thấy đơn chờ xác
 * nhận, người vận chuyển thấy đơn chờ lấy. Quán và admin thấy hết.
 */
function defaultStatus(user: AuthUser | null | undefined): BakeryOrderStatus | "" {
  if (!user || user.isSystem) return "";
  if (user.isBakery) return "ORDERED";
  if (!user.isShop && user.permissions.includes("BAKERY_ORDERS.PICKUP")) return "CONFIRMED";
  return "";
}

export default function BakeryOrdersScreen() {
  const router = useRouter();
  const { user, can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ status: defaultStatus(user) as string, shopUserId: "" }));
  const { applied, draft } = filter;

  const { data: shops = [] } = useUserOptions({ scope: "shopOnly", enabled: scopeAll });
  const list = useInfiniteList<BakeryOrder>(["bakery-orders"], "/bakery-orders", {
    status: applied.status || undefined,
    shopUserId: applied.shopUserId || undefined,
  });

  const summary: string[] = [];
  if (applied.status) summary.push(BAKERY_ORDER_STATUS_LABEL[applied.status as BakeryOrderStatus]);
  const shopName = shops.find((s) => s.id === applied.shopUserId)?.name;
  if (shopName) summary.push(shopName);
  if (summary.length === 0) summary.push("Tất cả đơn");

  const header = (
    <View style={styles.header}>
      <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {list.total} đơn</Text>
        {can("BAKERY_ORDERS", "ADD") ? (
          <Button
            title="Đặt bánh"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => router.push("/bakery-orders/new")}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Order bánh" }} />
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
          emptyMessage="Không có order bánh nào khớp bộ lọc."
          renderItem={(item) => (
            <ListRowCard
              title={item.code}
              subtitle={`${item.shopUser?.name ?? "—"} · ${item.supplier?.name ?? "—"}`}
              badge={<Badge tone={BAKERY_ORDER_STATUS_TONE[item.status]}>{BAKERY_ORDER_STATUS_LABEL[item.status]}</Badge>}
              onPress={() => router.push(`/bakery-orders/${item.id}`)}
              meta={[
                { label: "Ngày giao", value: formatDateOnly(item.deliveryOn) },
                { label: "Số loại bánh", value: String(item._count?.items ?? 0) },
              ]}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <Select
          label="Trạng thái"
          value={draft.status}
          onChange={(status) => filter.patchDraft({ status })}
          emptyLabel="Tất cả trạng thái"
          options={BAKERY_ORDER_STATUS_OPTIONS}
          searchable={false}
        />
        {scopeAll ? (
          <Select
            label="Quán"
            value={draft.shopUserId}
            onChange={(shopUserId) => filter.patchDraft({ shopUserId })}
            emptyLabel="Tất cả quán"
            options={shops.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}
      </FilterSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
});
