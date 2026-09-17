import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useProducts } from "@/hooks/useCatalog";
import { useFinishedGoodRecipe, useUpdateFinishedGoodRecipe } from "@/hooks/useFinishedGoodRecipes";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";

interface Row {
  productId: string;
  quantity: string;
}

/**
 * Khai báo định lượng nguyên liệu cho một đồ thành phẩm. Lưu cả bộ bằng một PUT như bản web —
 * server thay toàn bộ công thức, nên gửi thiếu dòng nào là xoá dòng đó.
 */
export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const finishedGoodItemId = id ?? "";
  const { can } = useCan();
  const canEdit = can("FINISHED_GOODS", "EDIT");

  const recipe = useFinishedGoodRecipe(finishedGoodItemId);
  const save = useUpdateFinishedGoodRecipe(finishedGoodItemId);
  const { data: products = [] } = useProducts({ activeOnly: true });

  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (recipe.data) {
      setRows(recipe.data.map((item) => ({ productId: item.productId, quantity: String(item.quantityPerUnit) })));
    }
  }, [recipe.data]);

  const used = new Set(rows.map((r) => r.productId));
  const options = products.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }));

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    const items = rows
      .filter((row) => row.productId && Number(row.quantity) > 0)
      .map((row) => ({ productId: row.productId, quantityPerUnit: Number(row.quantity) }));
    save.mutate(items);
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
            <Button title="Lưu công thức" fullWidth loading={save.isPending} onPress={submit} />
          </>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  rowIndex: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  quantity: { marginTop: spacing.md },
});
