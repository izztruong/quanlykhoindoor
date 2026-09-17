import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { formatDateVN, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { MaterialWaste } from "@/types";

export default function MaterialWasteScreen() {
  const router = useRouter();
  const { can } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange() }));
  const { applied, draft } = filter;

  const list = useInfiniteList<MaterialWaste>(["material-waste"], "/material-waste", {
    from: applied.range.from,
    to: applied.range.to,
  });

  const header = (
    <View style={styles.header}>
      <FilterBar
        summary={[formatRangeLabel(applied.range)]}
        activeCount={filter.activeCount}
        onOpen={filter.openSheet}
      />
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {list.total}</Text>
        {can("MATERIAL_WASTE", "ADD") ? (
          <Button
            title="Tạo phiếu"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => router.push("/material-waste/new")}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Phiếu huỷ nguyên liệu" }} />
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
          emptyMessage="Không có phiếu huỷ nào trong khoảng ngày này."
          renderItem={(item) => (
            <ListRowCard
              title={item.code}
              onPress={() => router.push(`/material-waste/${item.id}`)}
              meta={[
                { label: "Thời điểm huỷ", value: formatDateVN(item.wasteAt) },
                { label: "Người tạo", value: item.createdBy?.name ?? "—" },
                { label: "Số dòng", value: formatNumber((item.items?.length ?? 0) + (item.finishedItems?.length ?? 0)) },
              ]}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày huỷ" />
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
