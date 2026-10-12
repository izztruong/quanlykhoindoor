import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { currentMonthRange, DateRangeFilter, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ErrorState, Screen } from "@/components/ui/Screen";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import type { StockImportFilter } from "@/hooks/useStockImports";
import { formatCurrency, formatDateVN, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";
import type { StockImport } from "@/types";
import { shopLabel, stockImportTotal } from "./stockImport";

/**
 * Không có ô lọc Trạng thái lẫn Loại phiếu, giống bản web: phiếu nhập luôn COMPLETED nên lọc trạng
 * thái chỉ còn nghĩa với phiếu cũ, còn loại thì chỉ còn hai giá trị.
 *
 * Ô lọc Kho chỉ hiện với phạm vi ALL — quán chỉ thấy phiếu của kho mình (server lọc theo
 * `warehouse.shopUserId`, không theo người tạo) nên ô đó sẽ chỉ có một lựa chọn.
 */
export function StockImportList() {
  const { can, scopeAll } = useCan();
  const router = useRouter();
  const warehouses = useWarehouses();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), warehouseId: "" }));
  const f = filter.applied;
  const params: StockImportFilter = { ...f.range, warehouseId: f.warehouseId || undefined };
  const list = useInfiniteList<StockImport>(["stock-imports"], "/stock-imports", { ...params }, { enabled: can("STOCK_IMPORTS") });

  return (
    <>
      <Stack.Screen options={{ title: "Phiếu nhập kho" }} />
      <Screen scroll={false}>
        {!can("STOCK_IMPORTS") ? (
          <ErrorState message="Bạn không có quyền xem phiếu này." />
        ) : (
          <>
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              <FilterBar
                activeCount={filter.activeCount}
                onOpen={filter.openSheet}
                summary={[formatRangeLabel(f.range), warehouses.data?.find((w) => w.id === f.warehouseId)?.name].filter(
                  (s): s is string => !!s,
                )}
              />
              {can("STOCK_IMPORTS", "ADD") && <Button title="Tạo phiếu" onPress={() => router.push("/stock/imports/new")} />}
            </View>
            {list.error ? <ErrorState message={list.error.message} /> : null}
            <DataList
              data={list.items}
              keyExtractor={(r) => r.id}
              isLoading={list.isLoading}
              isRefetching={list.isRefetching}
              onRefresh={() => list.refetch()}
              onEndReached={list.loadMore}
              isFetchingMore={list.isFetchingNextPage}
              renderItem={(row) => (
                <ListRowCard
                  title={row.code}
                  subtitle={labels.stockImportType(row.type)}
                  onPress={() => router.push(`/stock/imports/${row.id}`)}
                  meta={[
                    { label: "Thời gian", value: formatDateVN(row.transactionAt) },
                    { label: "Quán", value: shopLabel(row.warehouse) },
                    { label: "Nhà cung cấp", value: row.supplier?.name ?? "—" },
                    { label: "Tổng tiền vốn", value: formatCurrency(stockImportTotal(row)) },
                  ]}
                />
              )}
            />
            <FilterSheet visible={filter.open} onClose={filter.close} onClear={filter.clear} onApply={filter.apply}>
              <DateRangeFilter value={filter.draft.range} onChange={(range) => filter.patchDraft({ range })} />
              {warehouses.error && <ErrorState message={warehouses.error.message} />}
              {scopeAll ? (
                <Select
                  label="Kho"
                  emptyLabel="Tất cả kho"
                  value={filter.draft.warehouseId}
                  options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name, sublabel: w.shopUser?.name }))}
                  onChange={(warehouseId) => filter.patchDraft({ warehouseId })}
                />
              ) : null}
            </FilterSheet>
          </>
        )}
      </Screen>
    </>
  );
}
