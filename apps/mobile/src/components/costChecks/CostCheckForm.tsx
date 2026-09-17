import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, Screen } from "@/components/ui/Screen";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useCreateCostCheck } from "@/hooks/useCostChecks";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUserOptions } from "@/hooks/useUsers";
import { buildCostCheckInput } from "@/lib/costCheck";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { filterSuggestions } from "@/lib/searchSuggestions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { FinishedGoodItem } from "@/types";

interface SoldRow { finishedGoodItemId: string; item: FinishedGoodItem; quantitySold: string }

export function CostCheckForm() {
  const { can } = useCan();
  return <>
    <Stack.Screen options={{ title: "Tạo phiếu Check Cost" }} />
    {can("COST_CHECKS", "ADD") ? <FormContent /> : <ErrorState message="Bạn không có quyền tạo phiếu Check Cost." />}
  </>;
}

function FormContent() {
  const router = useRouter();
  const users = useUserOptions();
  const finishedGoods = useFinishedGoodItems();
  const create = useCreateCostCheck();
  const [userId, setUserId] = useState("");
  const [openingStockCheckId, setOpeningStockCheckId] = useState("");
  const [closingStockCheckId, setClosingStockCheckId] = useState("");
  const [discountTra, setDiscountTra] = useState("");
  const [discountDav, setDiscountDav] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<SoldRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stockChecks = useStockChecks({ createdById: userId, pageSize: 500 }, { enabled: Boolean(userId) });
  const stockOptions = (stockChecks.data?.items ?? []).map((r) => ({
    value: r.id, label: `${r.code} — ${formatDateTime(r.checkedAt)}`,
  }));
  const suggestions = filterSuggestions(finishedGoods.data ?? [], new Set(rows.map((r) => r.finishedGoodItemId)), search);
  const loadError = users.error || finishedGoods.error || (userId ? stockChecks.error : null);

  function addRow(item: FinishedGoodItem) {
    setRows((prev) => prev.some((r) => r.finishedGoodItemId === item.id) ? prev : [...prev, { finishedGoodItemId: item.id, item, quantitySold: "" }]);
    setSearch("");
  }

  function submit() {
    if (create.isPending) return;
    setError(null);
    try {
      const data = buildCostCheckInput({ userId, openingStockCheckId, closingStockCheckId, note, discountTra, discountDav, rows });
      create.mutate(data, { onSuccess: (created) => router.replace(`/cost-checks/${created.id}`) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vui lòng kiểm tra thông tin phiếu.");
    }
  }

  return <Screen>
    <Card>
      <CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader>
      <CardBody style={styles.fields}>
        <Select label="Quán" required value={userId} options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
          disabled={create.isPending || users.isLoading} onChange={(value) => {
            setUserId(value); setOpeningStockCheckId(""); setClosingStockCheckId("");
          }} />
        <Select label="Phiếu kiểm kê đầu kỳ" required value={openingStockCheckId} options={stockOptions}
          disabled={!userId || stockChecks.isLoading || create.isPending} onChange={setOpeningStockCheckId} />
        <Select label="Phiếu kiểm kê cuối kỳ" required value={closingStockCheckId} options={stockOptions}
          disabled={!userId || stockChecks.isLoading || create.isPending} onChange={setClosingStockCheckId} />
        {userId && stockChecks.isSuccess && !stockOptions.length && <Text style={styles.muted}>Quán chưa có phiếu kiểm kê để chọn.</Text>}
        <Input label="Khuyến mãi Trà" keyboardType="decimal-pad" value={discountTra} onChangeText={setDiscountTra} editable={!create.isPending} />
        <Input label="Khuyến mãi ĐAV" keyboardType="decimal-pad" value={discountDav} onChangeText={setDiscountDav} editable={!create.isPending} />
        <Input label="Ghi chú" multiline value={note} onChangeText={setNote} editable={!create.isPending} />
      </CardBody>
    </Card>
    {loadError && <>
      <ErrorState message={loadError.message} />
      <Button title="Thử tải lại danh mục" variant="secondary" onPress={() => {
        void users.refetch(); void finishedGoods.refetch(); if (userId) void stockChecks.refetch();
      }} />
    </>}
    <Card>
      <CardHeader><CardTitle>SL đã bán trong kỳ</CardTitle></CardHeader>
      <CardBody style={styles.fields}>
        <SearchBar value={search} onChange={setSearch} placeholder="Tìm mã hoặc tên món để thêm..." />
        {finishedGoods.isLoading && <Text style={styles.muted}>Đang tải danh sách món...</Text>}
        {suggestions.map((item) => <Pressable key={item.id} disabled={create.isPending} accessibilityRole="button"
          accessibilityLabel={`Thêm ${item.name}`} onPress={() => addRow(item)} style={styles.suggestion}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.muted}>{item.code} · {item.unit?.name ?? "—"}</Text>
        </Pressable>)}
        {search.trim() && !finishedGoods.isLoading && !suggestions.length ? <Text style={styles.muted}>Không có món phù hợp chưa được thêm.</Text> : null}
        {!rows.length && <Text style={styles.muted}>Tìm và thêm các món đã bán trong kỳ.</Text>}
        {rows.map((row) => <View key={row.finishedGoodItemId} style={styles.soldRow}>
          <Text style={styles.name}>{row.item.name} · {row.item.unit?.name ?? "—"}</Text>
          <Input label="SL đã bán" keyboardType="decimal-pad" value={row.quantitySold} editable={!create.isPending}
            onChangeText={(quantitySold) => setRows((prev) => prev.map((r) => r.finishedGoodItemId === row.finishedGoodItemId ? { ...r, quantitySold } : r))} />
          <Button title="Bỏ dòng" variant="ghost" size="sm" disabled={create.isPending}
            onPress={() => setRows((prev) => prev.filter((r) => r.finishedGoodItemId !== row.finishedGoodItemId))} />
        </View>)}
      </CardBody>
    </Card>
    {error && <Text style={styles.error}>{error}</Text>}
    <Button title="Tạo phiếu" loading={create.isPending} onPress={submit} />
  </Screen>;
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  suggestion: { paddingVertical: spacing.sm, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  soldRow: { paddingTop: spacing.md, gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  name: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
