import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { DateRangeFilter, currentMonthRange, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import type { ExpenseProposalListResult } from "@/hooks/useExpenseProposals";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { LIST_PAGE_SIZE } from "@/hooks/useInfiniteList";
import { useUserOptions } from "@/hooks/useUsers";
import { api } from "@/lib/apiClient";
import { EXPENSE_PROPOSAL_STATUS_LABEL, EXPENSE_PROPOSAL_STATUS_TONE } from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

// REAPPROVAL không còn phiếu nào mang (bước duyệt bổ sung đã bỏ) nên không đưa vào bộ lọc.
const STATUS_OPTIONS = Object.entries(EXPENSE_PROPOSAL_STATUS_LABEL)
  .filter(([value]) => value !== "REAPPROVAL")
  .map(([value, label]) => ({ value, label }));

export default function ExpenseProposalsScreen() {
  const router = useRouter();
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), status: "", createdById: "", shopId: "" }));
  const { applied, draft } = filter;

  // Lọc "Người lập" thấy mọi tài khoản, không chỉ quán — giống bên web.
  const { data: users = [] } = useUserOptions({ enabled: scopeAll, scope: "all" });
  // Quán chi: chỉ tài khoản "là quán" (scope mặc định của /users/options).
  const { data: shops = [] } = useUserOptions({ enabled: scopeAll });

  const params = {
    from: applied.range.from,
    to: applied.range.to,
    status: applied.status || undefined,
    createdById: applied.createdById || undefined,
    shopId: applied.shopId || undefined,
  };

  // Không dùng useInfiniteList được: endpoint này trả thêm paidOutTotal (tổng của CẢ bộ lọc, không
  // phải của trang đang xem) mà kiểu PagedResult chung không có — y như màn Chi chốt ca.
  const list = useInfiniteQuery({
    queryKey: ["expense-proposals", "list", params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ExpenseProposalListResult>("/expense-proposals", { ...params, page: pageParam, pageSize: LIST_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      pages.length * LIST_PAGE_SIZE < lastPage.total ? pages.length + 1 : undefined,
  });

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const paidOutTotal = Number(list.data?.pages[0]?.paidOutTotal ?? 0);

  const summary = [formatRangeLabel(applied.range)];
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === applied.status)?.label;
  if (statusLabel) summary.push(statusLabel);
  const creatorName = users.find((u) => u.id === applied.createdById)?.name;
  if (creatorName) summary.push(creatorName);
  const shopName = shops.find((s) => s.id === applied.shopId)?.name;
  if (shopName) summary.push(shopName);

  const header = (
    <View style={styles.header}>
      <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />

      {/* Phiếu đã hoàn thành tính theo thực chi, phiếu còn dở tính theo tiền đã tạm ứng — nên con số
          này KHÔNG bằng tổng cột "Tổng tiền" (số dự kiến) của các thẻ bên dưới. */}
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Tiền quỹ đã xuất theo bộ lọc</Text>
        <Text style={styles.totalValue}>{formatCurrency(Math.round(paidOutTotal))}</Text>
        <Text style={styles.totalHint}>đã hoàn thành tính theo thực chi, còn dở tính theo tiền đã ứng</Text>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {total} phiếu</Text>
        {can("EXPENSE_PROPOSALS", "ADD") ? (
          <Button
            title="Tạo phiếu"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => router.push("/expense-proposals/new")}
          />
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: "Phiếu đề xuất chi" }} />
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
          emptyMessage="Không có phiếu đề xuất chi nào khớp bộ lọc."
          renderItem={(item) => (
            <ListRowCard
              title={item.code}
              subtitle={item.purpose}
              badge={<Badge tone={EXPENSE_PROPOSAL_STATUS_TONE[item.status]}>{EXPENSE_PROPOSAL_STATUS_LABEL[item.status]}</Badge>}
              onPress={() => router.push(`/expense-proposals/${item.id}`)}
              meta={[
                { label: "Ngày tạo", value: formatDateOnly(item.proposalDate) },
                { label: "Người lập", value: item.createdBy?.name ?? "—" },
                { label: "Quán chi", value: item.shop?.name ?? "—" },
                { label: "Người duyệt", value: item.approver?.name ?? "—" },
                { label: "Tổng tiền", value: formatCurrency(item.totalAmount) },
              ]}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày tạo phiếu" />
        <Select
          label="Trạng thái"
          value={draft.status}
          onChange={(status) => filter.patchDraft({ status })}
          emptyLabel="Tất cả trạng thái"
          options={STATUS_OPTIONS}
          searchable={false}
        />
        {scopeAll ? (
          <Select
            label="Người lập"
            value={draft.createdById}
            onChange={(createdById) => filter.patchDraft({ createdById })}
            emptyLabel="Tất cả người lập"
            options={users.map((u) => ({ value: u.id, label: u.name, sublabel: u.email }))}
          />
        ) : null}
        {scopeAll ? (
          <Select
            label="Quán chi"
            value={draft.shopId}
            onChange={(shopId) => filter.patchDraft({ shopId })}
            emptyLabel="Tất cả quán"
            options={shops.map((s) => ({ value: s.id, label: s.name, sublabel: s.email }))}
          />
        ) : null}
      </FilterSheet>
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
  totalHint: { fontSize: fontSize.xs, color: colors.info },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
});
