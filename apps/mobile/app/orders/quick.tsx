import { Stack, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { GroupSection } from "@/components/ui/GroupSection";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { useWarehouses } from "@/hooks/useCatalog";
import { useReorderThresholds } from "@/hooks/useReorderThresholds";
import { useCreateSalesOrder } from "@/hooks/useSalesOrders";
import { formatNumber } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ReorderThreshold } from "@/types";

/**
 * Order nhanh: quán khai tồn hiện tại, hệ thống tự tính số cần đặt theo định lượng min/max admin
 * đặt trước. Tồn dưới mức min thì đặt bù đúng (max − min); bằng hoặc trên min thì không đặt.
 */
export default function QuickOrderScreen() {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: thresholds = [] } = useReorderThresholds();
  const createOrder = useCreateSalesOrder();

  const [warehouseId, setWarehouseId] = useState("");
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const suggestedQty = useCallback(
    (threshold: ReorderThreshold): number => {
      const raw = stockInputs[threshold.productId];
      if (raw === undefined || raw === "") return 0;
      const current = Number(raw);
      if (!Number.isFinite(current)) return 0;
      const min = Number(threshold.minQuantity);
      const max = Number(threshold.maxQuantity);
      if (current < min) return Math.round((max - min) * 1000) / 1000;
      return 0;
    },
    [stockInputs],
  );

  const orderItems = useMemo(
    () => thresholds.map((t) => ({ productId: t.productId, quantity: suggestedQty(t) })).filter((it) => it.quantity > 0),
    [thresholds, suggestedQty],
  );

  const thresholdsByGroup = useMemo(() => {
    const groups = new Map<string, ReorderThreshold[]>();
    for (const t of thresholds) {
      const groupName = t.product.productGroup?.name ?? "Chưa phân nhóm";
      const list = groups.get(groupName) ?? [];
      list.push(t);
      groups.set(groupName, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [thresholds]);

  function submit() {
    if (!warehouseId) {
      Alert.alert("Thiếu thông tin", "Vui lòng chọn kho hàng.");
      return;
    }
    if (orderItems.length === 0) {
      Alert.alert("Chưa có gì để đặt", "Chưa có hàng hoá nào cần đặt thêm.");
      return;
    }
    createOrder.mutate(
      { warehouseId, items: orderItems, skipStockCheck: true },
      { onSuccess: (order) => router.replace(`/orders/${order.id}`) },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Order nhanh" }} />
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
          </CardBody>
        </Card>

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Sẽ đặt</Text>
          <Text style={styles.totalValue}>{orderItems.length} hàng hoá</Text>
        </View>

        <SearchBar value={search} onChange={setSearch} placeholder="Lọc theo tên hoặc mã..." />

        {thresholds.length === 0 ? (
          <Card>
            <CardBody>
              <Text style={styles.empty}>
                Tài khoản này chưa được khai định lượng Order nhanh. Nhờ quản trị viên cấu hình ở mục &quot;Định lượng
                Order nhanh&quot;.
              </Text>
            </CardBody>
          </Card>
        ) : null}

        {thresholdsByGroup.map(([groupName, groupThresholds]) => {
          const filtered = groupThresholds.filter((t) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return t.product.name.toLowerCase().includes(q) || t.product.code.toLowerCase().includes(q);
          });
          const filledCount = groupThresholds.filter((t) => stockInputs[t.productId] !== undefined && stockInputs[t.productId] !== "").length;

          return (
            <GroupSection
              key={groupName}
              label={groupName}
              count={groupThresholds.length}
              filledCount={filledCount}
              open={openGroup === groupName}
              onToggle={() => setOpenGroup(openGroup === groupName ? null : groupName)}
            >
              {filtered.length === 0 ? (
                <Text style={styles.emptyRow}>Không tìm thấy hàng hoá khớp bộ lọc.</Text>
              ) : (
                filtered.map((threshold) => {
                  const qty = suggestedQty(threshold);
                  return (
                    <View key={threshold.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {threshold.product.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {threshold.product.code} · {threshold.product.unit?.name ?? ""} · Định mức{" "}
                        {formatNumber(threshold.minQuantity)} – {formatNumber(threshold.maxQuantity)}
                      </Text>
                      <View style={styles.inputPair}>
                        <Input
                          containerStyle={styles.inputHalf}
                          label="Tồn hiện tại"
                          value={stockInputs[threshold.productId] ?? ""}
                          onChangeText={(value) =>
                            setStockInputs((prev) => ({ ...prev, [threshold.productId]: value }))
                          }
                          keyboardType="numeric"
                        />
                        <View style={styles.suggestion}>
                          <Text style={styles.suggestionLabel}>Cần đặt</Text>
                          <Text style={[styles.suggestionValue, qty > 0 && styles.suggestionValueActive]}>
                            {formatNumber(qty)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </GroupSection>
          );
        })}

        <Button title="Tạo đơn hàng" fullWidth loading={createOrder.isPending} onPress={submit} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: spacing.lg, paddingTop: spacing.lg },
  totalCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft, gap: 2 },
  totalLabel: { fontSize: fontSize.sm, color: colors.info },
  totalValue: { fontSize: fontSize.xl, fontWeight: "700", color: colors.info },
  empty: { fontSize: fontSize.sm, color: colors.textMuted },
  emptyRow: { padding: spacing.lg, fontSize: fontSize.sm, color: colors.textFaint, textAlign: "center" },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint },
  inputPair: { flexDirection: "row", gap: spacing.md, alignItems: "flex-end" },
  inputHalf: { flex: 1 },
  suggestion: { flex: 1, gap: 6 },
  suggestionLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  suggestionValue: {
    height: 46,
    lineHeight: 46,
    textAlign: "center",
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    fontSize: fontSize.md,
    color: colors.textFaint,
  },
  suggestionValueActive: { backgroundColor: colors.primarySoft, color: colors.primary, fontWeight: "700" },
});
