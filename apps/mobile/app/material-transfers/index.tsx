import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Screen, ErrorState } from "@/components/ui/Screen";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { currentMonthRange, DateRangeFilter, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { MaterialTransferListRow } from "@/hooks/useMaterialTransfers";
import { formatDateVN } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";

export default function MaterialTransfersScreen() {
  const { can } = useCan();
  const router = useRouter();
  const filter = useFilterSheet(() => ({ range: currentMonthRange() }));
  const list = useInfiniteList<MaterialTransferListRow>(["material-transfers"], "/material-transfers", { ...filter.applied.range }, { enabled: can("MATERIAL_TRANSFERS") });
  return <><Stack.Screen options={{ title: "Phiếu điều chuyển" }} />
    <Screen scroll={false}>
      {!can("MATERIAL_TRANSFERS") ? <ErrorState message="Bạn không có quyền xem phiếu điều chuyển." /> : <>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <FilterBar activeCount={filter.activeCount} summary={[formatRangeLabel(filter.applied.range)]} onOpen={filter.openSheet} />
          {can("MATERIAL_TRANSFERS", "ADD") && <Button title="Tạo phiếu" onPress={() => router.push("/material-transfers/new")} />}
        </View>
        {list.error && <ErrorState message={list.error.message} />}
        <DataList data={list.items} keyExtractor={(r) => r.id} isLoading={list.isLoading} isRefetching={list.isRefetching}
          onRefresh={() => list.refetch()} onEndReached={list.loadMore} isFetchingMore={list.isFetchingNextPage}
          renderItem={(r) => <ListRowCard title={r.code} subtitle={`${r.fromUser.name} → ${r.toUser.name}`} onPress={() => router.push(`/material-transfers/${r.id}`)}
            meta={[{ label: "Thời gian", value: formatDateVN(r.transferAt) }, { label: "Số dòng", value: r._count ? String(r._count.items) : "—" },
              { label: "Người tạo", value: r.createdBy?.name ?? "—" }, { label: "Ghi chú", value: r.note || "—" }]} />} />
        <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
          <DateRangeFilter value={filter.draft.range} onChange={(range) => filter.patchDraft({ range })} />
        </FilterSheet>
      </>}
    </Screen>
  </>;
}
