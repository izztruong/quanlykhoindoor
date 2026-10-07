import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useProcessSalesOrder, useSalesOrder, type SalesOrderProcessItemInput } from "@/hooks/useSalesOrders";
import { formatNumber } from "@/lib/format";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { Product, SalesOrder } from "@/types";

interface SplitLine {
  key: string;
  supplierId: string;
  costPrice: string;
  quantity: string;
}

/** Một hàng hoá trên màn xử lý: hàng quán đã đặt (itemId) hoặc hàng admin thêm mới (chỉ có product). */
interface ProcessRow {
  key: string;
  itemId?: string;
  product: Product;
  /** SL quán đặt; null = hàng admin tự thêm. */
  orderedQty: number | null;
  lines: SplitLine[];
  note: string;
  /** null = dùng ngày mặc định ở đầu màn. */
  receivedAt: Date | null;
}

let keyCounter = 0;
function nextKey(prefix: string) {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

function emptyLine(quantity = ""): SplitLine {
  return { key: nextKey("line"), supplierId: "", costPrice: "", quantity };
}

/**
 * Lần đầu (DRAFT, chưa có phiếu xuất) thì mỗi hàng một dòng NCC trống với SL = SL đặt. Đơn đã xử lý
 * thì dựng lại đúng các dòng NCC từ phiếu xuất — phiếu xuất là bản ghi duy nhất giữ NCC và giá.
 * Giữ y logic với OrderProcessClient bên web.
 */
function initialRows(order: SalesOrder): ProcessRow[] {
  const exportLines = order.stockExport?.items ?? [];
  return order.items.map((item) => {
    const lines = exportLines
      .filter((line) => line.productId === item.productId)
      .map((line) => ({
        key: nextKey("line"),
        supplierId: line.supplierId ?? "",
        costPrice: Number(line.costPrice) ? String(Number(line.costPrice)) : "",
        quantity: String(Number(line.quantity)),
      }));
    const fallbackQty = item.receivedQuantity != null ? Number(item.receivedQuantity) : Number(item.quantity);
    return {
      key: item.id,
      itemId: item.id,
      product: item.product,
      orderedQty: Number(item.quantity) > 0 ? Number(item.quantity) : null,
      lines: lines.length > 0 ? lines : [emptyLine(String(fallbackQty))],
      note: item.note ?? "",
      receivedAt: item.receivedAt ? new Date(item.receivedAt) : null,
    };
  });
}

/** Admin xử lý đơn: NCC, giá xuất, SL + ngày nhận, thêm hàng. Dùng cả để sửa đơn đã hoàn thành. */
export default function OrderProcessScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const { data: order, isLoading } = useSalesOrder(id);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Xử lý đơn" }} />
        <LoadingState />
      </>
    );
  }

  if (!order || order.status === "CANCELLED") {
    return (
      <>
        <Stack.Screen options={{ title: "Xử lý đơn" }} />
        <ErrorState message={order ? "Đơn hàng này đã huỷ" : "Không tìm thấy đơn hàng"} />
      </>
    );
  }

  // Tách component để state khởi tạo một lần từ dữ liệu đơn đã tải xong.
  return <OrderProcessForm order={order} />;
}

function OrderProcessForm({ order }: { order: SalesOrder }) {
  const router = useRouter();
  const { data: suppliers = [] } = useSuppliers();
  const { data: prices = [] } = useProductSupplierPrices();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const processOrder = useProcessSalesOrder(order.id);
  const isEdit = order.status === "COMPLETED";

  const [rows, setRows] = useState<ProcessRow[]>(() => initialRows(order));
  const [bulkReceivedAt, setBulkReceivedAt] = useState(() => new Date());

  const addableOptions = useMemo(() => {
    const inOrder = new Set(rows.map((r) => r.product.id));
    return products
      .filter((p) => !inOrder.has(p.id))
      .map((p) => ({ value: p.id, label: p.name, sublabel: p.code }));
  }, [products, rows]);

  function updateRow(key: string, patch: Partial<ProcessRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function updateLine(row: ProcessRow, lineKey: string, patch: Partial<SplitLine>) {
    updateRow(row.key, { lines: row.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) });
  }

  function suppliersForProduct(productId: string) {
    const supplierIds = new Set(prices.filter((p) => p.productId === productId).map((p) => p.supplierId));
    return suppliers.filter((s) => supplierIds.has(s.id));
  }

  /** Chọn NCC thì tự điền giá xuất trong bảng giá — vẫn sửa tay được vì lô thực tế có thể khác giá. */
  function setLineSupplier(row: ProcessRow, lineKey: string, supplierId: string) {
    const price = prices.find((p) => p.productId === row.product.id && p.supplierId === supplierId);
    updateLine(row, lineKey, price ? { supplierId, costPrice: String(price.exportPrice) } : { supplierId });
  }

  function addProduct(productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setRows((prev) => [
      ...prev,
      { key: nextKey("new"), product, orderedQty: null, lines: [emptyLine()], note: "", receivedAt: null },
    ]);
  }

  function applyBulkDateToAll() {
    setRows((prev) => prev.map((r) => ({ ...r, receivedAt: bulkReceivedAt })));
  }

  function submit() {
    const items: SalesOrderProcessItemInput[] = [];
    for (const row of rows) {
      // Bỏ những dòng NCC chưa điền SL; còn lại không dòng nào thì gửi một dòng SL 0 (= không nhận được).
      const lines = row.lines
        .filter((line) => line.quantity.trim() !== "")
        .map((line) => ({
          supplierId: line.supplierId || undefined,
          costPrice: line.costPrice.trim() === "" ? 0 : Number(line.costPrice.replace(",", ".")),
          quantity: Number(line.quantity.replace(",", ".")),
        }));
      if (lines.some((line) => Number.isNaN(line.quantity) || Number.isNaN(line.costPrice))) {
        Alert.alert("Số liệu không hợp lệ", `Số lượng hoặc giá của "${row.product.name}" không hợp lệ.`);
        return;
      }
      if (!row.itemId && lines.reduce((sum, l) => sum + l.quantity, 0) <= 0) {
        Alert.alert("Thiếu số lượng", `Nhập số lượng nhận cho hàng thêm mới "${row.product.name}", hoặc bỏ hàng đó đi.`);
        return;
      }
      items.push({
        itemId: row.itemId,
        productId: row.itemId ? undefined : row.product.id,
        receivedAt: (row.receivedAt ?? bulkReceivedAt).toISOString(),
        note: row.note.trim() || undefined,
        lines: lines.length > 0 ? lines : [{ costPrice: 0, quantity: 0 }],
      });
    }

    processOrder.mutate(items, {
      onSuccess: (updated) => {
        if (updated.affectedCostChecks.length > 0) {
          const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
          Alert.alert(
            "Đã lưu",
            `Các phiếu Check Cost sau có kỳ trùm ngày nhận cũ hoặc mới — số liệu của chúng CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
            [{ text: "Đã hiểu", onPress: () => router.replace(`/orders/${order.id}`) }],
          );
          return;
        }
        router.replace(`/orders/${order.id}`);
      },
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: isEdit ? "Sửa nhận hàng" : "Xử lý đơn" }} />
      <Screen>
        <Card>
          <CardBody style={styles.infoCard}>
            <Text style={styles.code}>{order.code}</Text>
            <Text style={styles.caption}>
              Nhập nhà cung cấp, giá xuất và số lượng thực nhận cho từng hàng hoá. Lưu xong đơn chuyển sang Hoàn thành và
              phiếu xuất kho được ghi theo đúng các dòng này; về sau vẫn sửa lại được.
            </Text>
            <Text style={styles.warehouse}>
              {order.createdBy?.name ?? "—"} · Kho xuất: {order.warehouse?.name ?? "—"}
            </Text>
            <DateTimeField label="Ngày nhận mặc định" value={bulkReceivedAt} onChange={setBulkReceivedAt} />
            <Button title="Áp ngày cho tất cả" variant="secondary" size="sm" onPress={applyBulkDateToAll} />
          </CardBody>
        </Card>

        {rows.map((row) => {
          const total = row.lines.reduce((sum, l) => sum + (Number(l.quantity.replace(",", ".")) || 0), 0);
          const supplierOptions = suppliersForProduct(row.product.id).map((s) => ({
            value: s.id,
            label: s.name,
            sublabel: s.code,
          }));
          const ordered = row.orderedQty;
          const totalStyle =
            ordered != null && total < ordered ? styles.totalShort : ordered != null && total > ordered ? styles.totalOver : null;

          return (
            <Card key={row.key}>
              <CardHeader>
                <CardTitle>{row.product.name}</CardTitle>
                {!row.itemId ? (
                  <Pressable
                    hitSlop={8}
                    accessibilityLabel="Bỏ hàng thêm mới"
                    onPress={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </Pressable>
                ) : null}
              </CardHeader>
              <CardBody style={styles.itemBody}>
                <Text style={styles.itemMeta}>
                  {row.product.code} · {ordered != null ? `Đặt ${formatNumber(ordered)}` : "Thêm mới"}{" "}
                  {row.product.unit?.name ?? ""}
                </Text>
                <Text style={[styles.total, totalStyle]}>
                  Tổng nhận: {formatNumber(total)}
                  {ordered != null ? ` / đặt ${formatNumber(ordered)}` : ""}
                </Text>

                {row.lines.map((line, index) => (
                  <View key={line.key} style={styles.lineCard}>
                    <View style={styles.lineHeader}>
                      <Text style={styles.lineTitle}>Nhà cung cấp {index + 1}</Text>
                      {row.lines.length > 1 ? (
                        <Pressable
                          hitSlop={8}
                          accessibilityLabel="Xoá dòng nhà cung cấp"
                          onPress={() => updateRow(row.key, { lines: row.lines.filter((l) => l.key !== line.key) })}
                        >
                          <Ionicons name="close-circle" size={20} color={colors.danger} />
                        </Pressable>
                      ) : null}
                    </View>
                    <Select
                      value={line.supplierId}
                      onChange={(value) => setLineSupplier(row, line.key, value)}
                      options={supplierOptions}
                      placeholder={supplierOptions.length ? "Chọn nhà cung cấp" : "Chưa khai bảng giá NCC"}
                      emptyLabel="Không chọn NCC"
                    />
                    <View style={styles.pair}>
                      <Input
                        containerStyle={styles.half}
                        label="Giá xuất"
                        value={line.costPrice}
                        onChangeText={(value) => updateLine(row, line.key, { costPrice: value })}
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.half}
                        label="SL nhận"
                        value={line.quantity}
                        onChangeText={(value) => updateLine(row, line.key, { quantity: value })}
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
                  onPress={() => updateRow(row.key, { lines: [...row.lines, emptyLine()] })}
                />

                <Input label="Ghi chú" value={row.note} onChangeText={(value) => updateRow(row.key, { note: value })} />
                <DateTimeField
                  label="Ngày nhận"
                  value={row.receivedAt ?? bulkReceivedAt}
                  onChange={(date) => updateRow(row.key, { receivedAt: date })}
                />
              </CardBody>
            </Card>
          );
        })}

        <Card>
          <CardBody style={styles.infoCard}>
            <Select
              label="Thêm hàng hoá"
              value=""
              onChange={addProduct}
              options={addableOptions}
              placeholder="Chọn hàng hoá cần thêm"
              searchable
            />
          </CardBody>
        </Card>

        <Button
          title={isEdit ? "Lưu thay đổi" : "Lưu & hoàn thành đơn"}
          fullWidth
          loading={processOrder.isPending}
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
  itemBody: { gap: spacing.md, paddingTop: spacing.xs },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint },
  total: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: "600" },
  totalShort: { color: colors.danger },
  totalOver: { color: colors.success },
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
