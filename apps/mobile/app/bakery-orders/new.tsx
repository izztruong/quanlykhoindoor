import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useBakeryOrderOptions, useCreateBakeryOrder } from "@/hooks/useBakeryOrders";
import { useUserOptions } from "@/hooks/useUsers";
import { parseQty } from "@/lib/bakeryOrder";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/dateOnly";
import { todayDateKey } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";

interface Row {
  productId: string;
  orderedQty: string;
  note: string;
}

const EMPTY_ROW: Row = { productId: "", orderedQty: "", note: "" };

/** Đặt bánh — bản mobile của BakeryOrderFormClient bên web. */
export default function NewBakeryOrderScreen() {
  const router = useRouter();
  const { user, scopeAll } = useCan();
  const createOrder = useCreateBakeryOrder();

  // Tài khoản quán tự đặt cho mình; người có phạm vi mọi quán (admin) phải chọn quán đặt hộ.
  const ordersForSelf = Boolean(user?.isShop) && !scopeAll;
  const { data: shops = [] } = useUserOptions({ scope: "shopOnly", enabled: !ordersForSelf });
  const [shopUserId, setShopUserId] = useState("");
  const effectiveShopId = ordersForSelf ? undefined : shopUserId;
  const { data: options, isLoading: optionsLoading } = useBakeryOrderOptions(
    effectiveShopId,
    ordersForSelf || Boolean(shopUserId),
  );

  const [supplierId, setSupplierId] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(todayDateKey());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([EMPTY_ROW]);

  const bakery = options?.bakeries.find((b) => b.supplierId === supplierId);
  const products = bakery?.products ?? [];
  const chosen = new Set(rows.map((r) => r.productId).filter(Boolean));
  const productOptions = products.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }));

  function changeShop(value: string) {
    // Danh sách bánh đặt được phụ thuộc quán, nên đổi quán là phải chọn lại từ đầu.
    setShopUserId(value);
    setSupplierId("");
    setRows([EMPTY_ROW]);
  }

  function changeBakery(value: string) {
    setSupplierId(value);
    setRows([EMPTY_ROW]);
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    const fail = (message: string) => Alert.alert("Thiếu thông tin", message);
    if (!ordersForSelf && !shopUserId) return fail("Chọn quán đặt.");
    if (!supplierId) return fail("Chọn tiệm bánh.");
    const items = rows.filter((r) => r.productId);
    if (items.length === 0) return fail("Thêm ít nhất 1 loại bánh.");
    if (items.some((r) => !(parseQty(r.orderedQty) > 0))) return fail("Số lượng đặt phải lớn hơn 0 ở mọi dòng.");

    createOrder.mutate(
      {
        shopUserId: effectiveShopId,
        supplierId,
        deliveryOn,
        note: note.trim() || undefined,
        items: items.map((r) => ({
          productId: r.productId,
          orderedQty: parseQty(r.orderedQty),
          note: r.note.trim() || undefined,
        })),
      },
      { onSuccess: (order) => router.replace(`/bakery-orders/${order.id}`) },
    );
  }

  const bakeryHint =
    options && options.bakeries.length === 0
      ? "Chưa có tiệm bánh nào. Admin cần nối NCC với tài khoản tiệm bánh ở Danh mục → Nhà cung cấp."
      : bakery && products.length === 0
        ? "Tiệm bánh này chưa có bánh nào quán đặt được (cần khai giá ở bảng giá NCC)."
        : null;

  return (
    <>
      <Stack.Screen options={{ title: "Đặt bánh" }} />
      <Screen>
        <Card>
          <CardBody style={styles.headerCard}>
            {!ordersForSelf ? (
              <Select
                label="Quán đặt"
                required
                value={shopUserId}
                onChange={changeShop}
                options={shops.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : null}
            <Select
              label="Tiệm bánh"
              required
              value={supplierId}
              onChange={changeBakery}
              disabled={!options}
              placeholder={
                optionsLoading ? "Đang tải..." : ordersForSelf || shopUserId ? "Chọn tiệm bánh" : "Chọn quán trước"
              }
              options={(options?.bakeries ?? []).map((b) => ({ value: b.supplierId, label: b.name }))}
              searchable={false}
            />
            {bakeryHint ? <Text style={styles.warn}>{bakeryHint}</Text> : null}
            <DateTimeField
              label="Ngày cần giao"
              required
              dateOnly
              value={dateOnlyToDate(deliveryOn)}
              onChange={(date) => setDeliveryOn(dateToDateOnly(date))}
            />
            <Input label="Ghi chú" value={note} onChangeText={setNote} placeholder="Không bắt buộc" multiline />
          </CardBody>
        </Card>

        {bakery
          ? rows.map((row, index) => {
              const unit = products.find((p) => p.id === row.productId)?.unit?.name;
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
                      value={row.productId}
                      onChange={(productId) => update(index, { productId })}
                      options={productOptions.filter((o) => o.value === row.productId || !chosen.has(o.value))}
                    />
                    <Input
                      label={unit ? `SL đặt (${unit})` : "SL đặt"}
                      required
                      keyboardType="decimal-pad"
                      value={row.orderedQty}
                      onChangeText={(orderedQty) => update(index, { orderedQty })}
                    />
                    <Input label="Ghi chú dòng" value={row.note} onChangeText={(value) => update(index, { note: value })} />
                  </CardBody>
                </Card>
              );
            })
          : null}

        {bakery ? (
          <Button
            title="Thêm bánh"
            variant="secondary"
            fullWidth
            disabled={rows.length >= products.length}
            icon={<Ionicons name="add" size={18} color={colors.text} />}
            onPress={() => setRows((prev) => [...prev, EMPTY_ROW])}
          />
        ) : null}
        <Button title="Đặt bánh" fullWidth loading={createOrder.isPending} onPress={submit} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: spacing.lg, paddingTop: spacing.lg },
  rowCard: { gap: spacing.md, paddingTop: spacing.lg },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowIndex: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  warn: { fontSize: fontSize.xs, color: colors.warning },
});
