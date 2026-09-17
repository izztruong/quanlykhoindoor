import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Screen, ErrorState } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { currentMonthRange, DateRangeFilter, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { useWarehouses } from "@/hooks/useCatalog";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { StockTransactionFilter } from "@/hooks/useStockTransactions";
import { formatCurrency, formatDateVN, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";
import type { StockTransaction } from "@/types";
import { statusOptions, stockConfig, stockTotal, type StockVariant } from "./stockConfig";

export function StockTransactionList({ variant }: { variant: StockVariant }) {
  const config = stockConfig[variant];
  const { can } = useCan();
  const router = useRouter();
  const warehouses = useWarehouses();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), warehouseId: "", status: "", type: "" }));
  const f = filter.applied;
  const params: StockTransactionFilter = { ...f.range, warehouseId: f.warehouseId || undefined, status: f.status || undefined, type: f.type || undefined };
  const list = useInfiniteList<StockTransaction>([config.endpoint.substring(1)], config.endpoint, { ...params }, { enabled: can(config.resource) });
  return <>
    <Stack.Screen options={{ title: config.title }} />
    <Screen scroll={false}>
      {!can(config.resource) ? <ErrorState message="Bạn không có quyền xem phiếu này." /> : <>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <FilterBar activeCount={filter.activeCount} onOpen={filter.openSheet} summary={[
            formatRangeLabel(f.range), warehouses.data?.find((w) => w.id === f.warehouseId)?.name,
            f.status ? labels.transactionStatus(f.status) : "", f.type ? config.typeLabel(f.type) : "",
          ].filter((s): s is string => !!s)} />
          {can(config.resource, "ADD") && <Button title="Tạo phiếu" onPress={() => router.push(`${config.base}/new`)} />}
        </View>
        {list.error ? <ErrorState message={list.error.message} /> : null}
        <DataList data={list.items} keyExtractor={(r) => r.id} isLoading={list.isLoading}
          isRefetching={list.isRefetching} onRefresh={() => list.refetch()} onEndReached={list.loadMore} isFetchingMore={list.isFetchingNextPage}
          renderItem={(row) => <ListRowCard title={row.code} subtitle={config.typeLabel(row.type)}
            badge={<Badge tone={row.status === "COMPLETED" ? "green" : row.status === "CANCELLED" ? "red" : "gray"}>{labels.transactionStatus(row.status)}</Badge>}
            onPress={() => router.push(`${config.base}/${row.id}`)} meta={[
              { label: "Thời gian", value: formatDateVN(row.transactionAt) }, { label: "Kho", value: row.warehouse.name },
              { label: variant === "import" ? "Nhà cung cấp" : "Khách hàng", value: (variant === "import" ? row.supplier?.name : row.customer?.name) ?? "—" },
              { label: "Tổng tiền vốn", value: formatCurrency(stockTotal(row)) },
            ]} />} />
        <FilterSheet visible={filter.open} onClose={filter.close} onClear={filter.clear} onApply={filter.apply}>
          <DateRangeFilter value={filter.draft.range} onChange={(range) => filter.patchDraft({ range })} />
          {warehouses.error && <ErrorState message={warehouses.error.message} />}
          <Select label="Kho" emptyLabel="Tất cả kho" value={filter.draft.warehouseId}
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={(warehouseId) => filter.patchDraft({ warehouseId })} />
          <Select label="Trạng thái" emptyLabel="Tất cả trạng thái" value={filter.draft.status} options={statusOptions} onChange={(status) => filter.patchDraft({ status })} />
          <Select label="Loại phiếu" emptyLabel="Tất cả loại" value={filter.draft.type} options={config.typeOptions} onChange={(type) => filter.patchDraft({ type })} />
        </FilterSheet>
      </>}
    </Screen>
  </>;
}
