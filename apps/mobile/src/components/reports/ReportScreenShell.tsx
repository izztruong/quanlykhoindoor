import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { Screen, EmptyState, ErrorState } from "@/components/ui/Screen";
import { DataList } from "@/components/ui/DataList";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { currentMonthRange, DateRangeFilter, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useWarehouses, useProducts, useProductGroups } from "@/hooks/useCatalog";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useReportList } from "@/hooks/useReports";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";

interface Props<T> {
  title: string;
  endpoint: string;
  renderRow: (row: T) => React.ReactElement;
  keyExtractor: (row: T) => string;
  dateRangeLabel?: string;
  filterMode?: "group" | "code";
  requireWarehouse?: boolean;
  paginated?: boolean;
}

export function ReportScreenShell<T>({ title, endpoint, renderRow, keyExtractor, dateRangeLabel, filterMode = "group", requireWarehouse = false, paginated = true }: Props<T>) {
  const { can } = useCan();
  const allowed = can("AUDIT_REPORTS");
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), warehouseId: "", productId: "", productGroupId: "", code: "" }));
  const warehouses = useWarehouses();
  const products = useProducts();
  const groups = useProductGroups();
  const f = filter.applied;
  const needsWarehouse = requireWarehouse && !f.warehouseId;
  const enabled = allowed && !needsWarehouse && !!f.range.from && !!f.range.to;
  const params = { ...f.range, warehouseId: f.warehouseId || undefined, productId: f.productId || undefined,
    productGroupId: filterMode === "group" ? f.productGroupId || undefined : undefined,
    code: filterMode === "code" ? f.code.trim() || undefined : undefined };
  const pages = useInfiniteList<T>(["reports", endpoint, "pages"], endpoint, params, { enabled: enabled && paginated });
  const all = useReportList<T>(endpoint, params, { enabled: enabled && !paginated });
  const query = paginated ? pages : all;
  const items = paginated ? pages.items : all.data?.items ?? [];
  const total = paginated ? pages.total : all.data?.total ?? 0;
  const lookupError = warehouses.error || products.error || groups.error;
  const summary = [formatRangeLabel(f.range),
    warehouses.data?.find((w) => w.id === f.warehouseId)?.name,
    products.data?.find((p) => p.id === f.productId)?.name,
    filterMode === "group" ? groups.data?.find((g) => g.id === f.productGroupId)?.name : f.code,
  ].filter((s): s is string => !!s);

  return <>
    <Stack.Screen options={{ title }} />
    <Screen scroll={false}>
      {!allowed ? <ErrorState message="Bạn không có quyền xem báo cáo này." /> : <>
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />
          {!needsWarehouse && <Text style={{ color: colors.textMuted }}>{total} dòng</Text>}
        </View>
        {needsWarehouse ? <EmptyState label="Vui lòng chọn kho hàng trong bộ lọc để xem dữ liệu." /> : <>
          {query.error ? <ErrorState message={query.error.message} /> : null}
          <DataList data={items} keyExtractor={keyExtractor} renderItem={renderRow}
            isLoading={query.isLoading} isRefetching={query.isRefetching} onRefresh={() => query.refetch()}
            onEndReached={paginated ? pages.loadMore : undefined} isFetchingMore={paginated && pages.isFetchingNextPage} />
        </>}
        <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
          {lookupError ? <ErrorState message={lookupError.message} /> : null}
          <DateRangeFilter label={dateRangeLabel} value={filter.draft.range} onChange={(range) => filter.patchDraft({ range })} />
          <Select label="Kho hàng" required={requireWarehouse} value={filter.draft.warehouseId} emptyLabel="Tất cả kho"
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(warehouseId) => filter.patchDraft({ warehouseId })} />
          <Select label="Hàng hoá" value={filter.draft.productId} emptyLabel="Tất cả hàng hoá" searchable
            options={(products.data ?? []).map((p) => ({ value: p.id, label: p.name, sublabel: p.code }))} onChange={(productId) => filter.patchDraft({ productId })} />
          {filterMode === "group" ? <Select label="Nhóm hàng hoá" value={filter.draft.productGroupId} emptyLabel="Tất cả nhóm"
            options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))} onChange={(productGroupId) => filter.patchDraft({ productGroupId })} />
            : <Input label="Mã phiếu" value={filter.draft.code} onChangeText={(code) => filter.patchDraft({ code })} autoCapitalize="characters" />}
        </FilterSheet>
      </>}
    </Screen>
  </>;
}
