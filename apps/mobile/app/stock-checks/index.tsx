import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useUserOptions } from "@/hooks/useUsers";
import { stockCheckTypeLabel } from "@/lib/deadlines";
import { formatDateVN } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { StockCheck } from "@/types";

export default function StockChecksScreen() {
  const router = useRouter();
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), createdById: "" }));
  const { applied, draft } = filter;

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  const list = useInfiniteList<StockCheck>(["stock-checks"], "/stock-checks", {
    from: applied.range.from,
    to: applied.range.to,
    createdById: applied.createdById || undefined,
  });

  const summary = [formatRangeLabel(applied.range)];
  const shopName = users.find((u) => u.id === applied.createdById)?.name;
  if (shopName) summary.push(shopName);

  const header = (
    <View style={styles.header}>
      <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {list.total}</Text>
        {can("STOCK_CHECKS", "ADD") ? (
          <Button
            title="Tạo phiếu"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => router.push("/stock-checks/new")}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Phiếu kiểm kê" }} />
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
          emptyMessage="Không có phiếu kiểm nào trong khoảng ngày này."
          renderItem={(item) => (
            <ListRowCard
              title={item.code}
              subtitle={item.type ? stockCheckTypeLabel[item.type] : undefined}
              badge={<LatenessDot dueAt={item.dueAt} isLate={item.isLate} />}
              onPress={() => router.push(`/stock-checks/${item.id}`)}
              meta={[
                { label: "Ngày kiểm", value: formatDateVN(item.checkedAt) },
                { label: "Người tạo", value: item.createdBy?.name ?? "—" },
              ]}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày kiểm" />
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
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
});
