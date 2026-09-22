import { Ionicons } from "@expo/vector-icons";
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
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useUserOptions } from "@/hooks/useUsers";
import {
  EXPENSE_PAYER_LABEL,
  EXPENSE_PROPOSAL_CATEGORY_LABEL,
  EXPENSE_PROPOSAL_STATUS_LABEL,
  EXPENSE_PROPOSAL_STATUS_TONE,
} from "@/lib/expenseProposal";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { ExpenseProposal } from "@/types";

const STATUS_OPTIONS = Object.entries(EXPENSE_PROPOSAL_STATUS_LABEL).map(([value, label]) => ({ value, label }));
const CATEGORY_OPTIONS = Object.entries(EXPENSE_PROPOSAL_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));

export default function ExpenseProposalsScreen() {
  const router = useRouter();
  const { can, scopeAll } = useCan();
  const filter = useFilterSheet(() => ({ range: currentMonthRange(), status: "", category: "", createdById: "" }));
  const { applied, draft } = filter;

  // Lọc "Người lập" thấy mọi tài khoản, không chỉ quán — giống bên web.
  const { data: users = [] } = useUserOptions({ enabled: scopeAll, scope: "all" });
  const list = useInfiniteList<ExpenseProposal>(["expense-proposals"], "/expense-proposals", {
    from: applied.range.from,
    to: applied.range.to,
    status: applied.status || undefined,
    category: applied.category || undefined,
    createdById: applied.createdById || undefined,
  });

  const summary = [formatRangeLabel(applied.range)];
  const statusLabel = STATUS_OPTIONS.find((o) => o.value === applied.status)?.label;
  if (statusLabel) summary.push(statusLabel);
  const categoryLabel = CATEGORY_OPTIONS.find((o) => o.value === applied.category)?.label;
  if (categoryLabel) summary.push(categoryLabel);
  const creatorName = users.find((u) => u.id === applied.createdById)?.name;
  if (creatorName) summary.push(creatorName);

  const header = (
    <View style={styles.header}>
      <FilterBar summary={summary} activeCount={filter.activeCount} onOpen={filter.openSheet} />
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {list.total} phiếu</Text>
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
          data={list.items}
          header={header}
          keyExtractor={(item) => item.id}
          isLoading={list.isLoading}
          isRefetching={list.isRefetching}
          onRefresh={() => list.refetch()}
          onEndReached={list.loadMore}
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
                { label: "Loại", value: item.category ? EXPENSE_PROPOSAL_CATEGORY_LABEL[item.category] : "—" },
                { label: "Người lập", value: item.createdBy?.name ?? "—" },
                { label: "Quán chi", value: item.shop?.name ?? "—" },
                { label: "Người duyệt", value: item.approver?.name ?? "—" },
                { label: "Người chi", value: EXPENSE_PAYER_LABEL[item.payer] },
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
        <Select
          label="Loại phiếu"
          value={draft.category}
          onChange={(category) => filter.patchDraft({ category })}
          emptyLabel="Tất cả loại phiếu"
          options={CATEGORY_OPTIONS}
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
