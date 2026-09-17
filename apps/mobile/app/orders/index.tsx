import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
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
import { formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { SALES_ORDER_STATUS_OPTIONS, SALES_ORDER_STATUS_TONE } from "@/lib/salesOrder";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { SalesOrderListRow } from "@/types";

export default function OrdersScreen() {
  const router = useRouter();
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), status: "", createdById: "" }));
  const { applied, draft } = filter;

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  const list = useInfiniteList<SalesOrderListRow>(["sales-orders"], "/sales-orders", {
    from: applied.range.from,
    to: applied.range.to,
    status: applied.status || undefined,
    createdById: applied.createdById || undefined,
  });

  const summary = [formatRangeLabel(applied.range)];
  const statusLabel = SALES_ORDER_STATUS_OPTIONS.find((o) => o.value === applied.status)?.label;
  if (statusLabel) summary.push(statusLabel);
  const shopName = users.find((u) => u.id === applied.createdById)?.name;
  if (shopName) summary.push(shopName);

  const header = (
    <View style={styles.header}>
      <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {list.total} đơn</Text>
        {can("ORDERS", "ADD") ? (
          <View style={styles.actions}>
            <Button title="Order nhanh" size="sm" variant="secondary" onPress={() => router.push("/orders/quick")} />
            <Button
              title="Tạo đơn"
              size="sm"
              icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
              onPress={() => router.push("/orders/new")}
            />
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Đơn hàng" }} />
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
          emptyMessage="Không có đơn hàng nào khớp bộ lọc."
          renderItem={(item) => (
            <ListRowCard
              title={item.code}
              subtitle={item.warehouse?.name}
              badge={
                <View style={styles.badges}>
                  <Badge tone={SALES_ORDER_STATUS_TONE[item.status]}>{labels.salesOrderStatus(item.status)}</Badge>
                  <LatenessDot dueAt={item.dueAt} isLate={item.isLate} showLabel={false} />
                </View>
              }
              onPress={() => router.push(`/orders/${item.id}`)}
              meta={[
                { label: "Ngày đặt", value: formatDateVN(item.orderDate) },
                { label: "Tổng SL", value: formatNumber(item.totalQuantity) },
                { label: "Người đặt", value: item.createdBy?.name ?? "—" },
              ]}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày đặt" />
        <Select
          label="Trạng thái"
          value={draft.status}
          onChange={(status) => filter.patchDraft({ status })}
          emptyLabel="Tất cả trạng thái"
          options={SALES_ORDER_STATUS_OPTIONS}
          searchable={false}
        />
        {scopeAll ? (
          <Select
            label="Quán"
            value={draft.createdById}
            onChange={(createdById) => filter.patchDraft({ createdById })}
            emptyLabel="Tất cả quán"
            options={users.map((u) => ({ value: u.id, label: u.name, sublabel: u.email }))}
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
  actions: { flexDirection: "row", gap: spacing.sm },
  badges: { alignItems: "flex-end", gap: spacing.xs },
});
