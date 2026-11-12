import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useSaveBakerySales } from "@/hooks/useBakerySales";
import { useFinishedGoodItems } from "@/hooks/useCatalog";
import { useUserOptions } from "@/hooks/useUsers";
import { parseQty } from "@/lib/bakeryOrder";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/dateOnly";
import { todayDateKey } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";

/**
 * Giá trị riêng cho "Bán ngoài" trong ô chọn — server nhận `shopUserId: null`. Không dùng chuỗi rỗng:
 * rỗng trông như "chưa chọn", mà bán ngoài là một lựa chọn có ý thức (xem bakerySales.schemas.ts).
 */
const OUTSIDE = "__outside__";

interface Row {
  finishedGoodItemId: string;
  quantity: string;
}

const EMPTY_ROW: Row = { finishedGoodItemId: "", quantity: "" };

/**
 * Nhập một lô bánh bán ra: CÙNG ngày, CÙNG người mua, nhiều bánh. Trên điện thoại người ta nhập theo
 * từng chuyến giao (một quán, một ngày), nên gom ngày + người mua lên đầu thay vì bắt chọn lại ở mỗi
 * dòng như bảng bên web. Khoá vẫn là (ngày, người mua, bánh) — nhập lại cùng ô là ghi đè.
 */
export default function NewBakerySalesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bakeryUserId?: string }>();
  const { user, scopeAll } = useCan();
  const save = useSaveBakerySales();

  // Có phạm vi mọi quán thì màn danh sách truyền tiệm bánh đã chọn sang; không thì là chính mình.
  const requestBakeryId = scopeAll ? params.bakeryUserId || undefined : undefined;
  const bakeryId = scopeAll ? (params.bakeryUserId ?? "") : (user?.id ?? "");

  const { data: shops = [] } = useUserOptions({ scope: "shopOnly" });
  // Ô chọn bánh theo MENU CỦA TIỆM BÁNH — nó mới là bên bán.
  const { data: allItems = [] } = useFinishedGoodItems({ shopUserId: bakeryId || undefined });
  const itemOptions = useMemo(
    () =>
      [...allItems]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((it) => ({ value: it.id, label: it.name, sublabel: it.code })),
    [allItems],
  );

  const [soldOn, setSoldOn] = useState(todayDateKey());
  const [buyer, setBuyer] = useState(OUTSIDE);
  const [rows, setRows] = useState<Row[]>([EMPTY_ROW]);

  const chosen = new Set(rows.map((r) => r.finishedGoodItemId).filter(Boolean));
  const buyerOptions = [{ value: OUTSIDE, label: "Bán ngoài" }, ...shops.map((s) => ({ value: s.id, label: s.name }))];

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    if (scopeAll && !bakeryId) {
      Alert.alert("Thiếu thông tin", "Quay lại chọn tiệm bánh trước.");
      return;
    }
    const filled = rows.filter((r) => r.finishedGoodItemId);
    if (filled.length === 0) {
      Alert.alert("Thiếu thông tin", "Thêm ít nhất 1 loại bánh.");
      return;
    }
    if (filled.some((r) => !(parseQty(r.quantity) > 0))) {
      Alert.alert("Thiếu thông tin", "Số lượng phải lớn hơn 0 ở mọi dòng. Muốn bỏ một dòng đã lưu thì xoá ở danh sách.");
      return;
    }
    const shopUserId = buyer === OUTSIDE ? null : buyer;
    save.mutate(
      {
        bakeryUserId: requestBakeryId,
        upserts: filled.map((r) => ({
          shopUserId,
          soldOn,
          finishedGoodItemId: r.finishedGoodItemId,
          quantity: parseQty(r.quantity),
        })),
        deletes: [],
      },
      {
        onSuccess: (result) => {
          if (result.replaced > 0) {
            Alert.alert("Đã lưu", `Đã lưu ${result.written} dòng, trong đó ${result.replaced} dòng ghi đè số cũ.`);
          }
          router.back();
        },
      },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Nhập bánh bán ra" }} />
      <Screen>
        <Card>
          <CardBody style={styles.headerCard}>
            <DateTimeField
              label="Ngày bán"
              required
              dateOnly
              value={dateOnlyToDate(soldOn)}
              onChange={(date) => setSoldOn(dateToDateOnly(date))}
              maximumDate={new Date()}
            />
            <Select label="Người mua" required value={buyer} onChange={setBuyer} options={buyerOptions} />
            <Text style={styles.hint}>
              Chọn &quot;Bán ngoài&quot; cho bánh bán cho người ngoài. Nhập lại cùng ngày, cùng người mua, cùng bánh là ghi
              đè số đã lưu.
            </Text>
          </CardBody>
        </Card>

        {rows.map((row, index) => {
          const unit = allItems.find((it) => it.id === row.finishedGoodItemId)?.unit?.name;
          return (
            <Card key={index}>
              <CardBody style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowIndex}>Bánh {index + 1}</Text>
                  {rows.length > 1 ? (
                    <Pressable
                      onPress={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                      hitSlop={8}
                      accessibilityLabel="Xoá dòng"
                    >
                      <Ionicons name="close-circle" size={22} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
                <Select
                  label="Bánh"
                  required
                  value={row.finishedGoodItemId}
                  onChange={(finishedGoodItemId) => update(index, { finishedGoodItemId })}
                  options={itemOptions.filter((o) => o.value === row.finishedGoodItemId || !chosen.has(o.value))}
                />
                <Input
                  label={unit ? `Số lượng (${unit})` : "Số lượng"}
                  required
                  keyboardType="decimal-pad"
                  value={row.quantity}
                  onChangeText={(quantity) => update(index, { quantity })}
                />
              </CardBody>
            </Card>
          );
        })}

        <Button
          title="Thêm bánh"
          variant="secondary"
          fullWidth
          disabled={rows.length >= itemOptions.length}
          icon={<Ionicons name="add" size={18} color={colors.text} />}
          onPress={() => setRows((prev) => [...prev, EMPTY_ROW])}
        />
        <Button title="Lưu" fullWidth loading={save.isPending} onPress={submit} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: spacing.lg, paddingTop: spacing.lg },
  rowCard: { gap: spacing.md, paddingTop: spacing.lg },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowIndex: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  hint: { fontSize: fontSize.xs, color: colors.textMuted },
});
