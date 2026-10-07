import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useProducts } from "@/hooks/useCatalog";
import {
  useDeleteFinishedGoodRecipeVersion,
  useFinishedGoodRecipe,
  useFinishedGoodRecipeVersions,
  useUpdateFinishedGoodRecipe,
} from "@/hooks/useFinishedGoodRecipes";
import { ApiError } from "@/lib/apiClient";
import { dateKeyFromLocal, dateKeyToLocalDate, formatDateOnly, formatNumber, toDateInput, todayDateKey } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { AffectedCostCheck } from "@/types";
import { colors, fontSize, spacing } from "@/lib/theme";

interface Row {
  productId: string;
  quantity: string;
}

/**
 * Khai báo định lượng nguyên liệu cho một đồ thành phẩm, theo MỐC HIỆU LỰC.
 *
 * Lưu cả bộ bằng một PUT như bản web — server thay toàn bộ công thức của mốc đó, nên gửi thiếu dòng
 * nào là bỏ nguyên liệu đó khỏi mốc. Đổi công thức giữa kỳ thì Check Cost tự tính phần trước mốc bằng
 * định lượng cũ và phần sau bằng định lượng mới, không phải tách phiếu.
 */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const finishedGoodItemId = id ?? "";
  const router = useRouter();
  const { can } = useCan();
  const canEdit = can("FINISHED_GOODS", "EDIT");
  const canDelete = can("FINISHED_GOODS", "DELETE");

  const recipe = useFinishedGoodRecipe(finishedGoodItemId);
  const versions = useFinishedGoodRecipeVersions(finishedGoodItemId);
  const save = useUpdateFinishedGoodRecipe(finishedGoodItemId);
  const removeVersion = useDeleteFinishedGoodRecipeVersion(finishedGoodItemId);
  const { data: products = [] } = useProducts({ activeOnly: true });

  const [rows, setRows] = useState<Row[]>([]);
  /** Mặc định HÔM NAY: luồng thường gặp là "quán vừa đổi công thức", bảng dưới đã điền sẵn bản hiện hành. */
  const [effectiveFrom, setEffectiveFrom] = useState(todayDateKey());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCostCheck[]>([]);

  useEffect(() => {
    if (recipe.data) {
      setRows(recipe.data.map((item) => ({ productId: item.productId, quantity: String(item.quantityPerUnit) })));
    }
  }, [recipe.data]);

  const versionList = versions.data ?? [];
  const isFirstVersion = versionList.length === 0;
  const matched = versionList.find((v) => toDateInput(v.effectiveFrom) === effectiveFrom);

  const used = new Set(rows.map((r) => r.productId));
  const options = products.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }));

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  /** Nạp một mốc cũ vào bảng để xem/sửa, đồng thời đổi ô ngày sang mốc đó. */
  function loadVersion(versionId: string) {
    const version = versionList.find((v) => v.id === versionId);
    if (!version) return;
    setEffectiveFrom(toDateInput(version.effectiveFrom));
    setRows(version.items.map((it) => ({ productId: it.productId, quantity: String(it.quantityPerUnit) })));
    setError(null);
    setSaved(null);
    setAffected([]);
  }

  function submit() {
    setError(null);
    setSaved(null);
    setAffected([]);
    const items = rows
      .filter((row) => row.productId && Number(row.quantity) > 0)
      .map((row) => ({ productId: row.productId, quantityPerUnit: Number(row.quantity) }));

    save.mutate(
      {
        items,
        // Công thức ĐẦU TIÊN không gửi ngày: server đặt mốc gốc để nó áp cho cả quá khứ, nếu không
        // thì phiếu Check Cost kỳ trước sẽ ra định mức 0.
        effectiveFrom: isFirstVersion ? undefined : effectiveFrom,
        overwrite: Boolean(matched),
      },
      {
        onSuccess: (result) => {
          setSaved(
            isFirstVersion
              ? "Đã lưu công thức, áp dụng cho cả dữ liệu trước đây."
              : `Đã lưu công thức áp dụng từ ${formatDateOnly(`${effectiveFrom}T00:00:00.000Z`)}.`,
          );
          setAffected(result.affectedCostChecks);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu công thức thất bại"),
      },
    );
  }

  function confirmDeleteVersion(versionId: string, label: string) {
    Alert.alert("Xoá mốc công thức", `Xoá mốc ${label}? Từ mốc này trở đi, Check Cost sẽ dùng mốc liền trước.`, [
      { text: "Huỷ", style: "cancel" },
      {
        text: "Xoá",
        style: "destructive",
        onPress: () => {
          setError(null);
          setSaved(null);
          setAffected([]);
          removeVersion.mutate(versionId, {
            onSuccess: (result) => {
              setSaved(`Đã xoá mốc ${label}.`);
              setAffected(result.affectedCostChecks);
            },
            onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá mốc thất bại"),
          });
        },
      },
    ]);
  }

  if (recipe.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Công thức" }} />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Công thức" }} />
      <Screen>
        <Card>
          <CardHeader><CardTitle>Mốc hiệu lực</CardTitle></CardHeader>
          <CardBody style={styles.fields}>
            {isFirstVersion ? (
              <Text style={styles.muted}>
                Đây là công thức đầu tiên của món này nên sẽ áp dụng cho cả dữ liệu trước đây. Lần sửa sau mới cần chọn ngày.
              </Text>
            ) : (
              <>
                <DateTimeField
                  label="Có hiệu lực từ"
                  dateOnly
                  value={dateKeyToLocalDate(effectiveFrom)}
                  onChange={(d) => setEffectiveFrom(dateKeyFromLocal(d))}
                />
                <Text style={styles.muted}>
                  {matched
                    ? `Đang sửa mốc ${formatDateOnly(`${effectiveFrom}T00:00:00.000Z`)} — lưu sẽ ghi đè công thức của mốc này.`
                    : `Sẽ tạo mốc mới từ ${formatDateOnly(`${effectiveFrom}T00:00:00.000Z`)}.`}
                </Text>
                <Text style={styles.faint}>Mốc tính theo ngày, nên đổi lúc nào trong ngày cũng áp dụng từ đầu ngày đó.</Text>
              </>
            )}
          </CardBody>
        </Card>

        {rows.length === 0 ? <EmptyState label="Chưa khai báo nguyên liệu nào." /> : null}

        {rows.map((row, index) => {
          const product = products.find((p) => p.id === row.productId);
          // Đơn vị công thức (vd Gram) mới là đơn vị của định lượng; không có thì dùng đơn vị chính.
          const unitName = product?.recipeUnit?.name ?? product?.unit?.name ?? "";
          return (
            <Card key={`${row.productId}-${index}`}>
              <CardBody>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowIndex}>Nguyên liệu {index + 1}</Text>
                  {canEdit ? (
                    <Pressable onPress={() => remove(index)} hitSlop={8} accessibilityLabel="Xoá dòng">
                      <Ionicons name="close-circle" size={22} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <Select
                  label="Hàng hoá"
                  value={row.productId}
                  onChange={(value) => update(index, { productId: value })}
                  disabled={!canEdit}
                  options={options.filter((o) => o.value === row.productId || !used.has(o.value))}
                />
                <Input
                  label={unitName ? `Định lượng (${unitName})` : "Định lượng"}
                  value={row.quantity}
                  onChangeText={(value) => update(index, { quantity: value })}
                  editable={canEdit}
                  keyboardType="numeric"
                  containerStyle={styles.quantity}
                />
              </CardBody>
            </Card>
          );
        })}

        {canEdit ? (
          <>
            <Button
              title="Thêm nguyên liệu"
              variant="secondary"
              fullWidth
              icon={<Ionicons name="add" size={18} color={colors.text} />}
              onPress={() => setRows((prev) => [...prev, { productId: "", quantity: "" }])}
            />
            <Button
              title={matched ? "Lưu mốc này" : "Lưu công thức"}
              fullWidth
              loading={save.isPending}
              onPress={submit}
            />
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.success}>{saved}</Text> : null}
        {affected.length > 0 ? (
          <Card>
            <CardBody>
              <Text style={styles.warning}>
                Các phiếu Check Cost sau có kỳ chứa mốc này nên số liệu không còn khớp công thức mới — phiếu đã chốt số
                nên không tự cập nhật, cần huỷ và tạo lại nếu muốn: {affected.map((c) => c.code).join(", ")}
              </Text>
            </CardBody>
          </Card>
        ) : null}

        {versionList.length > 0 ? (
          <Card>
            <CardHeader><CardTitle>Các mốc đã có</CardTitle></CardHeader>
            <CardBody style={styles.fields}>
              {versionList.map((version, index) => (
                <View key={version.id} style={styles.versionRow}>
                  <View style={styles.versionInfo}>
                    <Text style={styles.versionDate}>
                      {formatDateOnly(version.effectiveFrom)}
                      {index === 0 ? <Text style={styles.current}>  đang áp dụng</Text> : null}
                    </Text>
                    <Text style={styles.faint}>
                      {formatNumber(version.items.length)} nguyên liệu · {version.createdBy?.name ?? "—"}
                    </Text>
                  </View>
                  <View style={styles.versionActions}>
                    <Button title="Xem / sửa" variant="secondary" size="sm" onPress={() => loadVersion(version.id)} />
                    {canDelete ? (
                      <Button
                        title="Xoá"
                        variant="ghost"
                        size="sm"
                        disabled={removeVersion.isPending}
                        onPress={() => confirmDeleteVersion(version.id, formatDateOnly(version.effectiveFrom))}
                      />
                    ) : null}
                  </View>
                </View>
              ))}
            </CardBody>
          </Card>
        ) : null}

        <Button
          title="Giá bán theo thời gian →"
          variant="secondary"
          fullWidth
          onPress={() => router.push(`/catalog/finished-goods/${finishedGoodItemId}/prices`)}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  rowIndex: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  quantity: { marginTop: spacing.md },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  faint: { fontSize: fontSize.sm, color: colors.textFaint },
  error: { fontSize: fontSize.sm, color: colors.danger },
  success: { fontSize: fontSize.sm, color: colors.success },
  warning: { fontSize: fontSize.sm, color: colors.warning },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  versionInfo: { flex: 1, gap: spacing.xs },
  versionDate: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  current: { fontSize: fontSize.sm, fontWeight: "400", color: colors.success },
  versionActions: { flexDirection: "row", gap: spacing.xs },
});
