import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingState, Screen } from "@/components/ui/Screen";
import { useDeleteFinishedGoodPrice, useFinishedGoodPrices, useSaveFinishedGoodPrice } from "@/hooks/useFinishedGoodPrices";
import { ApiError } from "@/lib/apiClient";
import { dateKeyFromLocal, dateKeyToLocalDate, formatCurrency, formatDateOnly, toDateInput, todayDateKey } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { AffectedCostCheck } from "@/types";
import { colors, fontSize, spacing } from "@/lib/theme";

/**
 * Lịch sử giá bán của một đồ thành phẩm/món.
 *
 * Doanh thu Check Cost dùng giá CÓ HIỆU LỰC tại từng ngày bán, nên đổi giá giữa tháng không còn làm
 * lệch doanh thu cả kỳ. Ô "Giá bán" ở danh mục vẫn là giá hiện hành và được server cập nhật trong
 * cùng transaction khi lưu một mốc không thuộc tương lai.
 */
export default function FinishedGoodPricesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const finishedGoodItemId = id ?? "";
  const { can } = useCan();
  const canEdit = can("FINISHED_GOODS", "EDIT");
  const canDelete = can("FINISHED_GOODS", "DELETE");

  const prices = useFinishedGoodPrices(finishedGoodItemId);
  const save = useSaveFinishedGoodPrice(finishedGoodItemId);
  const removePrice = useDeleteFinishedGoodPrice(finishedGoodItemId);

  const [effectiveFrom, setEffectiveFrom] = useState(todayDateKey());
  const [sellingPrice, setSellingPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCostCheck[]>([]);

  const list = prices.data ?? [];
  const matched = list.find((p) => toDateInput(p.effectiveFrom) === effectiveFrom);

  function submit() {
    setError(null);
    setSaved(null);
    setAffected([]);
    const value = Number(sellingPrice.trim().replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setError("Giá bán phải là số không âm.");
      return;
    }
    save.mutate(
      { effectiveFrom, sellingPrice: value },
      {
        onSuccess: (result) => {
          setSaved(`Đã lưu giá bán áp dụng từ ${formatDateOnly(`${effectiveFrom}T00:00:00.000Z`)}.`);
          setSellingPrice("");
          setAffected(result.affectedCostChecks);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu giá bán thất bại"),
      },
    );
  }

  function confirmDelete(priceId: string, label: string) {
    Alert.alert("Xoá mốc giá", `Xoá mốc giá ${label}? Từ mốc này trở đi, Check Cost sẽ dùng mốc liền trước.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: () => {
          setError(null);
          setSaved(null);
          setAffected([]);
          removePrice.mutate(priceId, {
            onSuccess: (result) => {
              setSaved(`Đã xoá mốc giá ${label}.`);
              setAffected(result.affectedCostChecks);
            },
            onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá mốc giá thất bại"),
          });
        },
      },
    ]);
  }

  if (prices.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Giá bán theo thời gian" }} />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Giá bán theo thời gian" }} />
      <Screen>
        <Card>
          <CardBody>
            <Text style={styles.muted}>
              Doanh thu trong phiếu Check Cost tính theo giá có hiệu lực tại từng ngày bán, nên đổi giá giữa tháng không
              làm lệch doanh thu của cả kỳ. Mốc tính theo ngày.
            </Text>
          </CardBody>
        </Card>

        {canEdit ? (
          <Card>
            <CardHeader><CardTitle>Thêm mốc giá</CardTitle></CardHeader>
            <CardBody style={styles.fields}>
              <DateTimeField
                label="Có hiệu lực từ"
                dateOnly
                value={dateKeyToLocalDate(effectiveFrom)}
                onChange={(d) => setEffectiveFrom(dateKeyFromLocal(d))}
              />
              <Input
                label="Giá bán"
                keyboardType="decimal-pad"
                value={sellingPrice}
                onChangeText={setSellingPrice}
                editable={!save.isPending}
              />
              {matched ? (
                <Text style={styles.muted}>
                  Đã có mốc {formatDateOnly(matched.effectiveFrom)} giá {formatCurrency(matched.sellingPrice)} — lưu sẽ ghi đè.
                </Text>
              ) : null}
              <Button
                title={matched ? "Sửa mốc này" : "Thêm mốc"}
                fullWidth
                loading={save.isPending}
                onPress={submit}
              />
            </CardBody>
          </Card>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.success}>{saved}</Text> : null}
        {affected.length > 0 ? (
          <Card>
            <CardBody>
              <Text style={styles.warning}>
                Các phiếu Check Cost sau có kỳ chứa mốc này nên doanh thu không còn khớp giá mới — phiếu đã chốt số nên
                không tự cập nhật, cần huỷ và tạo lại nếu muốn: {affected.map((c) => c.code).join(", ")}
              </Text>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Các mốc giá</CardTitle></CardHeader>
          <CardBody style={styles.fields}>
            {list.length === 0 ? (
              <EmptyState label="Chưa có mốc giá nào." />
            ) : (
              list.map((price, index) => (
                <View key={price.id} style={styles.row}>
                  <View style={styles.info}>
                    <Text style={styles.date}>
                      {formatDateOnly(price.effectiveFrom)}
                      {index === 0 ? <Text style={styles.current}>  đang áp dụng</Text> : null}
                    </Text>
                    <Text style={styles.faint}>{price.createdBy?.name ?? "—"}</Text>
                  </View>
                  <Text style={styles.price}>{formatCurrency(price.sellingPrice)}</Text>
                  {canDelete ? (
                    <Button
                      title="Xoá"
                      variant="ghost"
                      size="sm"
                      disabled={removePrice.isPending}
                      onPress={() => confirmDelete(price.id, formatDateOnly(price.effectiveFrom))}
                    />
                  ) : null}
                </View>
              ))
            )}
          </CardBody>
        </Card>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  faint: { fontSize: fontSize.sm, color: colors.textFaint },
  error: { fontSize: fontSize.sm, color: colors.danger },
  success: { fontSize: fontSize.sm, color: colors.success },
  warning: { fontSize: fontSize.sm, color: colors.warning },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  info: { flex: 1, gap: spacing.xs },
  date: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  current: { fontSize: fontSize.sm, fontWeight: "400", color: colors.success },
  price: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
});
