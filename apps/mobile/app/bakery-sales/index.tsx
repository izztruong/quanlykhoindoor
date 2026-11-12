import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { DateRangeFilter, formatRangeLabel } from "@/components/filters/DateRangeFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { Select } from "@/components/ui/Select";
import { useSaveBakerySales } from "@/hooks/useBakerySales";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { useUserOptions } from "@/hooks/useUsers";
import { dateToDateOnly } from "@/lib/dateOnly";
import { formatDateOnly, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { BakerySaleRowItem } from "@/types";

/** Mặc định 7 ngày gần nhất — tiệm bánh nhập hằng ngày, xem lại vài hôm trước là đủ. */
function lastWeekRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  return { from: dateToDateOnly(from), to: dateToDateOnly(now) };
}

/**
 * "Bánh bán ra" — trục bán ra của tiệm bánh, nguồn định mức và doanh thu của Check Cost tiệm bánh.
 *
 * Danh sách có phân trang nên chỉ XOÁ TỪNG DÒNG theo khoá của nó, không bao giờ so cả bảng — y như bản
 * web (BakerySaleEntry). Dòng mới soạn ở màn riêng rồi lưu cả lô.
 *
 * Tài khoản tiệm bánh xem/nhập của chính mình (server tự suy khi bỏ trống `bakeryUserId`); người có
 * phạm vi mọi quán phải chọn tiệm bánh.
 */
export default function BakerySalesScreen() {
  const router = useRouter();
  const { user, can, scopeAll } = useCan();
  const save = useSaveBakerySales();

  const { data: bakeries = [] } = useUserOptions({ scope: "bakery", enabled: scopeAll });
  const [pickedBakeryId, setPickedBakeryId] = useState("");
  // Bỏ trống gửi lên server = chính mình; còn ô chọn menu bánh cần id thật.
  const requestBakeryId = scopeAll ? pickedBakeryId || undefined : undefined;
  const bakeryId = scopeAll ? pickedBakeryId : user?.isBakery ? user.id : "";
  const ready = Boolean(bakeryId);

  const filter = useFilterSheet(() => ({ range: lastWeekRange() }));
  const { applied, draft } = filter;

  const list = useInfiniteList<BakerySaleRowItem>(
    ["bakery-sales"],
    "/bakery-sales",
    { bakeryUserId: requestBakeryId, from: applied.range.from, to: applied.range.to },
    { enabled: ready },
  );

  const canWrite = can("BAKERY_SALES", "ADD");

  function deleteRow(row: BakerySaleRowItem) {
    const soldOn = row.soldOn.slice(0, 10);
    Alert.alert("Xoá dòng", `Xoá ${row.finishedGoodItem.name} ngày ${formatDateOnly(row.soldOn)}?`, [
      { text: "Không", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: () =>
          save.mutate({
            bakeryUserId: requestBakeryId,
            upserts: [],
            deletes: [{ shopUserId: row.shopUserId, soldOn, finishedGoodItemId: row.finishedGoodItemId }],
          }),
      },
    ]);
  }

  const header = (
    <View style={styles.header}>
      {scopeAll ? (
        <Select
          label="Tiệm bánh"
          value={pickedBakeryId}
          onChange={setPickedBakeryId}
          placeholder="Chọn tiệm bánh"
          options={bakeries.map((b) => ({ value: b.id, label: b.name }))}
          searchable={false}
        />
      ) : null}
      <FilterBar summary={[formatRangeLabel(applied.range)]} activeCount={filter.activeCount} onOpen={filter.openSheet} />
      <Text style={styles.hint}>
        Mỗi dòng là một ô (ngày, người mua, bánh). Nhập lại cùng ô là ghi đè.
      </Text>
      <View style={styles.summaryRow}>
        <Text style={styles.summary}>{ready ? `Tổng ${list.total} dòng` : ""}</Text>
        {canWrite && ready ? (
          <Button
            title="Nhập bánh bán ra"
            size="sm"
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() =>
              router.push({ pathname: "/bakery-sales/new", params: scopeAll ? { bakeryUserId: pickedBakeryId } : {} })
            }
          />
        ) : null}
      </View>
    </View>
  );

  const emptyMessage = ready
    ? "Chưa có dòng nào trong khoảng ngày này."
    : scopeAll
      ? "Chọn tiệm bánh để xem dữ liệu."
      : "Tài khoản này không phải tiệm bánh.";

  return (
    <>
      <Stack.Screen options={{ title: "Bánh bán ra" }} />
      <View style={styles.root}>
        <DataList
          data={ready ? list.items : []}
          header={header}
          keyExtractor={(item) => item.id}
          isLoading={ready && list.isLoading}
          isRefetching={list.isRefetching}
          onRefresh={() => ready && list.refetch()}
          onEndReached={list.loadMore}
          isFetchingMore={list.isFetchingNextPage}
          emptyMessage={emptyMessage}
          renderItem={(row) => (
            <ListRowCard
              title={row.finishedGoodItem.name}
              subtitle={row.finishedGoodItem.code}
              badge={row.shopUser ? <Badge tone="blue">{row.shopUser.name}</Badge> : <Badge tone="yellow">Bán ngoài</Badge>}
              meta={[
                { label: "Ngày", value: formatDateOnly(row.soldOn) },
                {
                  label: "Số lượng",
                  value: `${formatNumber(row.quantity)}${row.finishedGoodItem.unit?.name ? ` ${row.finishedGoodItem.unit.name}` : ""}`,
                },
              ]}
              onDelete={canWrite ? () => deleteRow(row) : undefined}
            />
          )}
        />
      </View>

      <FilterSheet visible={filter.open} onClose={filter.close} onApply={filter.apply} onClear={filter.clear}>
        <DateRangeFilter value={draft.range} onChange={(range) => filter.patchDraft({ range })} label="Ngày bán" />
      </FilterSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.textMuted },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
});
