import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useSuppliers } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useConfirmSalesOrderWithExport, useSalesOrder } from "@/hooks/useSalesOrders";
import { formatNumber } from "@/lib/format";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { SalesOrderItem } from "@/types";

interface SplitLine {
  key: string;
  supplierId: string;
  costPrice: string;
  quantity: string;
}

let splitLineCounter = 0;
function nextSplitLineKey() {
  splitLineCounter += 1;
  return `split-${splitLineCounter}`;
}

/**
 * Xác nhận đơn & tạo phiếu xuất kho. Một hàng hoá có thể chia cho nhiều nhà cung cấp, nên mỗi hàng
 * hoá giữ một danh sách dòng NCC riêng; số đặt được không bắt buộc khớp số đã đặt.
 */
export default function OrderConfirmScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();

  const { data: order, isLoading } = useSalesOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const { data: prices = [] } = useProductSupplierPrices();
  const confirmOrder = useConfirmSalesOrderWithExport(id);

  const [linesByItemId, setLinesByItemId] = useState<Record<string, SplitLine[]>>({});
  const [notesByItemId, setNotesByItemId] = useState<Record<string, string>>({});
  const [datesByItemId, setDatesByItemId] = useState<Record<string, Date>>({});
  const [bulkReceivedAt, setBulkReceivedAt] = useState(() => new Date());

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Xác nhận đơn" }} />
        <LoadingState />
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Stack.Screen options={{ title: "Xác nhận đơn" }} />
        <ErrorState message="Không tìm thấy đơn hàng" />
      </>
    );
  }

  if (order.status !== "DRAFT") {
    return (
      <>
        <Stack.Screen options={{ title: "Xác nhận đơn" }} />
        <Screen>
          <Card>
            <CardBody>
              <Text style={styles.notice}>Đơn hàng này đã được xác nhận rồi.</Text>
            </CardBody>
          </Card>
          <Button title="Xem chi tiết đơn hàng" variant="secondary" fullWidth onPress={() => router.replace(`/orders/${id}`)} />
        </Screen>
      </>
    );
  }

  function linesFor(item: SalesOrderItem): SplitLine[] {
    return linesByItemId[item.id] ?? [{ key: "default", supplierId: "", costPrice: "", quantity: String(item.quantity) }];
  }

  function setLines(itemId: string, lines: SplitLine[]) {
    setLinesByItemId((prev) => ({ ...prev, [itemId]: lines }));
  }

  function updateLine(item: SalesOrderItem, key: string, patch: Partial<SplitLine>) {
    setLines(
      item.id,
      linesFor(item).map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  /** Chọn NCC thì tự điền giá xuất trong bảng giá — vẫn sửa tay được vì lô thực tế có thể khác giá. */
  function setLineSupplier(item: SalesOrderItem, key: string, supplierId: string) {
    const price = prices.find((p) => p.productId === item.productId && p.supplierId === supplierId);
    updateLine(item, key, price ? { supplierId, costPrice: String(price.exportPrice) } : { supplierId });
  }

  function suppliersForProduct(productId: string) {
    const supplierIds = new Set(prices.filter((p) => p.productId === productId).map((p) => p.supplierId));
    return suppliers.filter((s) => supplierIds.has(s.id));
  }

  function allocatedFor(item: SalesOrderItem): number {
    return linesFor(item).reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  function receivedAtFor(item: SalesOrderItem): Date {
    return datesByItemId[item.id] ?? bulkReceivedAt;
  }

  function submit() {
    const items = order!.items.flatMap((item) => {
      // Theo từng hàng hoá, không theo từng dòng NCC tách nhỏ — gắn note vào mọi dòng của item đó.
      const note = (notesByItemId[item.id] ?? "").trim() || undefined;
      const receivedAt = receivedAtFor(item).toISOString();
      return (
        linesFor(item)
          // Giữ dòng đã thực sự nhập số lượng (kể cả 0 — nghĩa là không đặt được từ NCC nào), chỉ bỏ
          // những dòng chia thêm mà chưa ai điền gì.
          .filter((line) => line.quantity.trim() !== "")
          .map((line) => ({
            itemId: item.id,
            supplierId: line.supplierId || undefined,
            costPrice: line.costPrice.trim() === "" ? 0 : Number(line.costPrice),
            quantity: Number(line.quantity),
            note,
            receivedAt,
          }))
      );
    });

    confirmOrder.mutate(items, { onSuccess: () => router.replace(`/orders/${id}`) });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Xác nhận đơn" }} />
      <Screen>
        <Card>
          <CardBody style={styles.infoCard}>
            <Text style={styles.code}>{order.code}</Text>
            <Text style={styles.caption}>
              Chọn nhà cung cấp, giá xuất và số lượng thực đặt được cho từng hàng hoá. Xác nhận xong sẽ tự tạo phiếu
              xuất kho gắn với đơn này và chờ quán xác nhận lại số lượng.
            </Text>
            <Text style={styles.warehouse}>Kho xuất: {order.warehouse?.name ?? "—"}</Text>
            <DateTimeField label="Ngày nhận dự kiến (mặc định)" value={bulkReceivedAt} onChange={setBulkReceivedAt} />
          </CardBody>
        </Card>

        {order.items.map((item) => {
          const lines = linesFor(item);
          const allocated = allocatedFor(item);
          const ordered = Number(item.quantity);
          const supplierOptions = suppliersForProduct(item.productId).map((s) => ({
            value: s.id,
            label: s.name,
            sublabel: s.code,
          }));

          return (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{item.product?.name ?? "—"}</CardTitle>
              </CardHeader>
              <CardBody style={styles.itemBody}>
                <Text style={styles.itemMeta}>
                  {item.product?.code} · Đặt {formatNumber(ordered)} {item.product?.unit?.name ?? ""}
                </Text>
                <Text style={[styles.allocated, allocated !== ordered && styles.allocatedDiff]}>
                  Đã phân bổ: {formatNumber(allocated)} / {formatNumber(ordered)}
                </Text>

                {lines.map((line, index) => (
                  <View key={line.key} style={styles.lineCard}>
                    <View style={styles.lineHeader}>
                      <Text style={styles.lineTitle}>Nhà cung cấp {index + 1}</Text>
                      {lines.length > 1 ? (
                        <Pressable
                          hitSlop={8}
                          accessibilityLabel="Xoá dòng nhà cung cấp"
                          onPress={() =>
                            setLines(
                              item.id,
                              lines.filter((l) => l.key !== line.key),
                            )
                          }
                        >
                          <Ionicons name="close-circle" size={20} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Select
                      value={line.supplierId}
                      onChange={(value) => setLineSupplier(item, line.key, value)}
                      options={supplierOptions}
                      placeholder={supplierOptions.length ? "Chọn nhà cung cấp" : "Chưa khai bảng giá NCC"}
                      emptyLabel="Không chọn NCC"
                    />
                    <View style={styles.pair}>
                      <Input
                        containerStyle={styles.half}
                        label="Giá xuất"
                        value={line.costPrice}
                        onChangeText={(value) => updateLine(item, line.key, { costPrice: value })}
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.half}
                        label="Số lượng"
                        value={line.quantity}
                        onChangeText={(value) => updateLine(item, line.key, { quantity: value })}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                ))}

                <Button
                  title="Chia cho NCC khác"
                  variant="ghost"
                  size="sm"
                  icon={<Ionicons name="add" size={16} color={colors.primary} />}
                  onPress={() =>
                    setLines(item.id, [...lines, { key: nextSplitLineKey(), supplierId: "", costPrice: "", quantity: "" }])
                  }
                />

                <Input
                  label="Ghi chú"
                  value={notesByItemId[item.id] ?? ""}
                  onChangeText={(value) => setNotesByItemId((prev) => ({ ...prev, [item.id]: value }))}
                />
                <DateTimeField
                  label="Ngày nhận dự kiến"
                  value={receivedAtFor(item)}
                  onChange={(date) => setDatesByItemId((prev) => ({ ...prev, [item.id]: date }))}
                />
              </CardBody>
            </Card>
          );
        })}

        <Button
          title="Xác nhận & tạo phiếu xuất kho"
          fullWidth
          loading={confirmOrder.isPending}
          onPress={submit}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  infoCard: { paddingTop: spacing.lg, gap: spacing.md },
  code: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  caption: { fontSize: fontSize.sm, color: colors.textMuted },
  warehouse: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  notice: { fontSize: fontSize.sm, color: colors.textMuted },
  itemBody: { gap: spacing.md, paddingTop: spacing.xs },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint },
  allocated: { fontSize: fontSize.sm, color: colors.success, fontWeight: "600" },
  allocatedDiff: { color: colors.warning },
  lineCard: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: spacing.md,
    backgroundColor: colors.subtle,
  },
  lineHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  lineTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});
