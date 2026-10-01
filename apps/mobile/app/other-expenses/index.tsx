import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { OtherExpenseFormModal } from "@/components/otherExpenses/OtherExpenseFormModal";
import { OtherExpenseImageViewer } from "@/components/otherExpenses/OtherExpenseImageViewer";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard, RowAction } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { LIST_PAGE_SIZE } from "@/hooks/useInfiniteList";
import { useDeleteOtherExpense, type OtherExpenseListResult } from "@/hooks/useOtherExpenses";
import { useUserOptions } from "@/hooks/useUsers";
import { api } from "@/lib/apiClient";
import { formatCurrency, formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { OtherExpense } from "@/types";

export default function OtherExpensesScreen() {
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), createdById: "" }));
  const { applied, draft } = filter;
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OtherExpense | "new" | null>(null);
  const [viewingImagesOf, setViewingImagesOf] = useState<string | null>(null);

  // Ô tìm kiếm nối thẳng vào queryKey, nên không hoãn lại thì mỗi ký tự là một lượt gọi API.
  const debouncedSearch = useDebouncedValue(search);

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  const remove = useDeleteOtherExpense();

  const params = {
    from: applied.range.from,
    to: applied.range.to,
    search: debouncedSearch || undefined,
    createdById: applied.createdById || undefined,
  };

  // Không dùng useInfiniteList được: endpoint này trả thêm totalAmount (tổng của CẢ bộ lọc,
  // không phải của trang đang xem) mà kiểu PagedResult chung không có.
  const list = useInfiniteQuery({
    queryKey: ["other-expenses", "list", params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<OtherExpenseListResult>("/other-expenses", { ...params, page: pageParam, pageSize: LIST_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      pages.length * LIST_PAGE_SIZE < lastPage.total ? pages.length + 1 : undefined,
  });

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const totalAmount = Number(list.data?.pages[0]?.totalAmount ?? 0);

  function confirmDelete(item: OtherExpense) {
    Alert.alert("Xoá khoản chi", `Xoá "${item.content}"?`, [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: () => remove.mutate(item.id) },
    ]);
  }

  const summary = [formatRangeLabel(applied.range)];
  const creatorName = users.find((u) => u.id === applied.createdById)?.name;
  if (creatorName) summary.push(creatorName);

  const header = (
    <View style={styles.header}>
      <FilterBar
        summary={summary}
        activeCount={filter.activeCount}
        onOpen={filter.openSheet}
        search={{ value: search, onChange: setSearch, placeholder: "Tìm theo nội dung..." }}
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Tổng tiền theo bộ lọc</Text>
        <Text style={styles.totalValue}>{formatCurrency(Math.round(totalAmount))}</Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {total} khoản</Text>
        {can("OTHER_EXPENSES", "ADD") ? (
          <Button
            title="Thêm khoản chi"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => setEditing("new")}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Chi ngoài" }} />
      <View style={styles.root}>
        <DataList
          data={items}
          header={header}
          keyExtractor={(item) => item.id}
          isLoading={list.isLoading}
          isRefetching={list.isRefetching}
          onRefresh={() => list.refetch()}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
          }}
          isFetchingMore={list.isFetchingNextPage}
          emptyMessage="Không có khoản chi nào khớp bộ lọc."
          renderItem={(item) => (
            <ListRowCard
              title={item.content}
              subtitle={`Ngày chi: ${formatDateOnly(item.spentAt)}`}
              meta={[
                // formatDateTime chứ không phải formatDateOnly: createdAt là mốc thật, đọc theo
                // getUTC* thì khoản ghi sau 17h giờ VN hiện lùi một ngày.
                { label: "Ngày lập phiếu", value: formatDateTime(item.createdAt) },
                {
                  label: "Số lượng",
                  value: `${formatNumber(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`,
                },
                { label: "Đơn giá", value: formatCurrency(item.unitPrice) },
                { label: "Thành tiền", value: formatCurrency(item.amount) },
                { label: "Người tạo", value: item.createdBy?.name ?? "—" },
                ...(item.note ? [{ label: "Ghi chú", value: item.note }] : []),
              ]}
              actions={
                item.imageCount ? (
                  <RowAction
                    icon="image-outline"
                    label={`Xem ảnh (${item.imageCount})`}
                    onPress={() => setViewingImagesOf(item.id)}
                  />
                ) : null
              }
              onEdit={can("OTHER_EXPENSES", "EDIT") ? () => setEditing(item) : undefined}
              onDelete={can("OTHER_EXPENSES", "DELETE") ? () => confirmDelete(item) : undefined}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày chi" />
        {scopeAll ? (
          <Select
            label="Người tạo"
            value={draft.createdById}
            onChange={(createdById) => filter.patchDraft({ createdById })}
            emptyLabel="Tất cả tài khoản"
            options={users.map((u) => ({ value: u.id, label: u.name, sublabel: u.email }))}
          />
        ) : null}
      </FilterSheet>

      {editing ? (
        <OtherExpenseFormModal
          visible
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <OtherExpenseImageViewer expenseId={viewingImagesOf} onClose={() => setViewingImagesOf(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  totalCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    gap: 2,
  },
  totalLabel: { fontSize: fontSize.sm, color: colors.info },
  totalValue: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.info },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
});
