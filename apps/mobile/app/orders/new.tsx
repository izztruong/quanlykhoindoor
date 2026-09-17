import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useProductStock, useProducts, useWarehouses } from "@/hooks/useCatalog";
import { useCreateSalesOrder } from "@/hooks/useSalesOrders";
import { formatNumber } from "@/lib/format";
import { colors, fontSize, spacing } from "@/lib/theme";

interface Row {
  productId: string;
  quantity: string;
}

export default function NewOrderScreen() {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const createOrder = useCreateSalesOrder();

  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([{ productId: "", quantity: "" }]);

  const { data: stock = [] } = useProductStock(warehouseId);
  const stockByProduct = useMemo(() => new Map(stock.map((s) => [s.productId, Number(s.quantity)])), [stock]);

  const chosen = new Set(rows.map((r) => r.productId).filter(Boolean));
  const productOptions = products.map((p) => ({ value: p.id, label: p.name, sublabel: p.code }));

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    if (!warehouseId) {
      Alert.alert("Thiếu thông tin", "Chọn kho hàng.");
      return;
    }
    const items = rows
      .filter((row) => row.productId && Number(row.quantity) > 0)
      .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) }));

    if (items.length === 0) {
      Alert.alert("Thiếu thông tin", "Cần ít nhất 1 hàng hoá có số lượng lớn hơn 0.");
      return;
    }

    createOrder.mutate(
      { warehouseId, note: note || undefined, items },
      { onSuccess: (created) => router.replace(`/orders/${created.id}`) },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Tạo đơn hàng" }} />
      <Screen>
        <Card>
          <CardBody style={styles.headerCard}>
            <Select
              label="Kho hàng"
              required
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map((w) => ({ value: w.id, label: w.name, sublabel: w.code }))}
            />
            <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
          </CardBody>
        </Card>

        {rows.map((row, index) => {
          const available = row.productId ? stockByProduct.get(row.productId) : undefined;
          const product = products.find((p) => p.id === row.productId);
          return (
            <Card key={index}>
              <CardBody style={styles.rowCard}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowIndex}>Hàng hoá {index + 1}</Text>
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
                  label="Hàng hoá"
                  required
                  value={row.productId}
                  onChange={(value) => update(index, { productId: value })}
                  options={productOptions.filter((o) => o.value === row.productId || !chosen.has(o.value))}
                />
                <Input
                  label={product?.unit?.name ? `Số lượng (${product.unit.name})` : "Số lượng"}
                  required
                  value={row.quantity}
                  onChangeText={(value) => update(index, { quantity: value })}
                  keyboardType="numeric"
                  hint={
                    warehouseId && row.productId
                      ? `Tồn kho hiện tại: ${available != null ? formatNumber(available) : 0}`
                      : undefined
                  }
                />
              </CardBody>
            </Card>
          );
        })}

        <Button
          title="Thêm hàng hoá"
          variant="secondary"
          fullWidth
          icon={<Ionicons name="add" size={18} color={colors.text} />}
          onPress={() => setRows((prev) => [...prev, { productId: "", quantity: "" }])}
        />
        <Button title="Tạo đơn hàng" fullWidth loading={createOrder.isPending} onPress={submit} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: spacing.lg, paddingTop: spacing.lg },
  rowCard: { gap: spacing.md, paddingTop: spacing.lg },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowIndex: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
});
