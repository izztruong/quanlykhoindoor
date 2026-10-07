import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useCreateCostCheck } from "@/hooks/useCostChecks";
import { useStockChecks } from "@/hooks/useStockChecks";
import { useUserOptions } from "@/hooks/useUsers";
import { buildCostCheckInput } from "@/lib/costCheck";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";

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
  const create = useCreateCostCheck();
  const [userId, setUserId] = useState("");
  const [openingStockCheckId, setOpeningStockCheckId] = useState("");
  const [closingStockCheckId, setClosingStockCheckId] = useState("");
  const [discountTra, setDiscountTra] = useState("");
  const [discountDav, setDiscountDav] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const stockChecks = useStockChecks({ createdById: userId, pageSize: 500 }, { enabled: Boolean(userId) });
  const stockOptions = (stockChecks.data?.items ?? []).map((r) => ({
    value: r.id, label: `${r.code} — ${formatDateTime(r.checkedAt)}`,
  }));
  const loadError = users.error || (userId ? stockChecks.error : null);

  function submit() {
    if (create.isPending) return;
    setError(null);
    try {
      const data = buildCostCheckInput({ userId, openingStockCheckId, closingStockCheckId, note, discountTra, discountDav });
      create.mutate(data, {
        onSuccess: (created) => router.replace(`/cost-checks/${created.id}`),
        // Kỳ không có doanh số POS thì server trả 409 kèm hướng dẫn — hiện nguyên văn, đừng rút gọn.
        onError: (err) => setError(err instanceof Error ? err.message : "Tạo phiếu thất bại."),
      });
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
        void users.refetch(); if (userId) void stockChecks.refetch();
      }} />
    </>}
    <Card>
      <CardHeader><CardTitle>SL đã bán trong kỳ</CardTitle></CardHeader>
      <CardBody style={styles.fields}>
        <Text style={styles.muted}>
          Lấy tự động từ doanh số POS của kỳ, không cần nhập tay. Doanh số POS nhập trên web
          (Quản trị › Doanh số POS) — kỳ nào chưa có dữ liệu thì không tạo được phiếu.
        </Text>
      </CardBody>
    </Card>
    {error && <Text style={styles.error}>{error}</Text>}
    <Button title="Tạo phiếu" loading={create.isPending} onPress={submit} />
  </Screen>;
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
