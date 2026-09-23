import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { ShiftExpenseFormModal } from "@/components/shiftExpenses/ShiftExpenseFormModal";
import { ShiftExpenseImageViewer } from "@/components/shiftExpenses/ShiftExpenseImageViewer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard, RowAction } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { LIST_PAGE_SIZE } from "@/hooks/useInfiniteList";
import { useDeleteShiftExpense, useToggleShiftExpensePaid, type ShiftExpenseListResult } from "@/hooks/useShiftExpenses";
import { useUserOptions } from "@/hooks/useUsers";
import { api } from "@/lib/apiClient";
import { SHIFT_EXPENSE_TYPE_OPTIONS, formatCurrency, formatDateOnly, formatDateTime, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ShiftExpense } from "@/types";

export default function ShiftExpensesScreen() {
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), type: "", createdById: "", paid: "" }));
  const { applied, draft } = filter;
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ShiftExpense | "new" | null>(null);
  const [viewingImagesOf, setViewingImagesOf] = useState<string | null>(null);

  // Ô tìm kiếm nối thẳng vào queryKey, nên không hoãn lại thì mỗi ký tự là một lượt gọi API.
  const debouncedSearch = useDebouncedValue(search);

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  const remove = useDeleteShiftExpense();
  const togglePaid = useToggleShiftExpensePaid();

  const params = {
    from: applied.range.from,
    to: applied.range.to,
    type: applied.type || undefined,
    search: debouncedSearch || undefined,
    createdById: applied.createdById || undefined,
    paid: (applied.paid || undefined) as "true" | "false" | undefined,
  };

  // Không dùng useInfiniteList được: endpoint này trả thêm totalAmount (tổng của CẢ bộ lọc,
  // không phải của trang đang xem) mà kiểu PagedResult chung không có.
  const list = useInfiniteQuery({
    queryKey: ["shift-expenses", "list", params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ShiftExpenseListResult>("/shift-expenses", { ...params, page: pageParam, pageSize: LIST_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      pages.length * LIST_PAGE_SIZE < lastPage.total ? pages.length + 1 : undefined,
  });

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const totalAmount = Number(list.data?.pages[0]?.totalAmount ?? 0);

  function confirmDelete(item: ShiftExpense) {
    Alert.alert("Xoá khoản chi", `Xoá "${item.content}"?`, [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: () => remove.mutate(item.id) },
    ]);
  }

  // Hỏi cả hai chiều: danh sách thẻ dày nên bấm nhầm là chuyện thường, mà đánh dấu là khoá luôn
  // quán khỏi sửa/xoá khoản đó.
  function confirmTogglePaid(item: ShiftExpense) {
    const paid = !item.paidAt;
    Alert.alert(
      paid ? "Đánh dấu đã chi" : "Bỏ đánh dấu đã chi",
      paid
        ? `Đánh dấu "${item.content}" là đã chi? Quán sẽ không sửa hay xoá khoản này được nữa.`
        : `Bỏ đánh dấu "${item.content}"? Quán sẽ sửa/xoá lại được.`,
      [
        { text: "Huỷ", style: "cancel" },
        { text: paid ? "Đánh dấu" : "Bỏ đánh dấu", onPress: () => togglePaid.mutate({ id: item.id, paid }) },
      ],
    );
  }

  const summary = [formatRangeLabel(applied.range)];
  const typeLabel = SHIFT_EXPENSE_TYPE_OPTIONS.find((o) => o.value === applied.type)?.label;
  if (typeLabel) summary.push(typeLabel);
  const shopName = users.find((u) => u.id === applied.createdById)?.name;
  if (shopName) summary.push(shopName);

  const header = (
    <View style={styles.header}>
      <FilterBar
        summary={summary}
        activeCount={filter.activeCount}
        onOpen={filter.openSheet}
        search={{ value: search, onChange: setSearch, placeholder: "Tìm theo nội dung..." }}
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Tổng chi theo bộ lọc</Text>
        <Text style={styles.totalValue}>{formatCurrency(Math.round(totalAmount))}</Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {total} khoản</Text>
        {can("SHIFT_EXPENSES", "ADD") ? (
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
      <Stack.Screen options={{ title: "Chi chốt ca" }} />
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
              badge={
                <View style={styles.badges}>
                  {item.paidAt ? <Badge tone="green">Đã chi</Badge> : null}
                  <Badge tone={item.type === "MATERIAL" ? "blue" : "gray"}>{labels.shiftExpenseType(item.type)}</Badge>
                </View>
              }
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
                // Mobile không có màn chi tiết nên ai đánh dấu / lúc nào phải nằm ngay trên thẻ.
                ...(item.paidAt
                  ? [{ label: "Đã chi", value: `${item.paidBy?.name ?? "—"} · ${formatDateTime(item.paidAt)}` }]
                  : []),
              ]}
              actions={
                <>
                  {item.imageCount ? (
                    <RowAction
                      icon="image-outline"
                      label={`Xem ảnh (${item.imageCount})`}
                      onPress={() => setViewingImagesOf(item.id)}
                    />
                  ) : null}
                  {can("SHIFT_EXPENSES", "PAY") ? (
                    <RowAction
                      icon={item.paidAt ? "arrow-undo-outline" : "checkmark-circle-outline"}
                      label={item.paidAt ? "Bỏ đánh dấu" : "Đánh dấu đã chi"}
                      onPress={() => confirmTogglePaid(item)}
                    />
                  ) : null}
                </>
              }
              onEdit={
                // Ẩn hẳn chứ không làm mờ như bên web: RowAction không có trạng thái disabled và
                // điện thoại không có tooltip, nên nút mờ chỉ là nút bấm không ăn. Badge "Đã chi"
                // ngay đầu thẻ đã là lời giải thích.
                can("SHIFT_EXPENSES", "EDIT") && !item.paidAt ? () => setEditing(item) : undefined
              }
              onDelete={can("SHIFT_EXPENSES", "DELETE") && !item.paidAt ? () => confirmDelete(item) : undefined}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày chi" />
        <Select
          label="Loại chi"
          value={draft.type}
          onChange={(type) => filter.patchDraft({ type })}
          emptyLabel="Tất cả loại chi"
          options={SHIFT_EXPENSE_TYPE_OPTIONS}
          searchable={false}
        />
        <Select
          label="Trạng thái chi"
          value={draft.paid}
          onChange={(paid) => filter.patchDraft({ paid })}
          emptyLabel="Tất cả"
          options={[
            { value: "false", label: "Chưa chi" },
            { value: "true", label: "Đã chi" },
          ]}
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

      {editing ? (
        <ShiftExpenseFormModal
          visible
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ShiftExpenseImageViewer expenseId={viewingImagesOf} onClose={() => setViewingImagesOf(null)} />
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
  badges: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
});
