import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { Alert, StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useSalesOrder, useSetSalesOrderProcessed, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { SALES_ORDER_STATUS_TONE } from "@/lib/salesOrder";
import { colors, fontSize, spacing } from "@/lib/theme";

/**
 * Chi tiết đơn — chỉ đọc. Đơn hàng là ĐỀ XUẤT của quán: chỉ có hàng hoá và SL đặt. Hàng thực nhận
 * (NCC, giá, SL, ngày, chứng từ) nằm ở phiếu nhập kho của quán, không ở đây.
 *
 * Ô tích "Đã xử lý" chỉ để admin đánh dấu đơn nào đã làm — thay màn "Xử lý đơn" cũ.
 */
export default function OrderDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const { can } = useCan();

  const { data: order, isLoading, isRefetching, refetch } = useSalesOrder(id);
  const updateStatus = useUpdateSalesOrderStatus(id);
  const setProcessed = useSetSalesOrderProcessed(id);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Đơn hàng" }} />
        <LoadingState />
      </>
    );
  }

  if (!order) {
    return (
      <>
        <Stack.Screen options={{ title: "Đơn hàng" }} />
        <ErrorState message="Không tìm thấy đơn hàng" />
      </>
    );
  }

  const canApprove = can("ORDERS", "APPROVE");
  const isProcessed = Boolean(order.processedAt);
  // Server chỉ cho huỷ đơn chưa huỷ: APPROVE huỷ mọi đơn, ADD huỷ đơn của mình.
  const canCancel = order.status === "DRAFT" && (canApprove || can("ORDERS", "ADD"));

  function handleCancel() {
    Alert.alert("Huỷ đơn hàng", "Bạn có chắc muốn huỷ đơn hàng này?", [
      { text: "Không", style: "cancel" },
      { text: "Huỷ đơn", style: "destructive", onPress: () => updateStatus.mutate("CANCELLED") },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: order.code }} />
      <Screen refreshing={isRefetching} onRefresh={() => refetch()}>
        <Card>
          <CardBody style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.code}>{order.code}</Text>
              <View style={styles.badges}>
                <Badge tone={SALES_ORDER_STATUS_TONE[order.status]}>{labels.salesOrderStatus(order.status)}</Badge>
                {isProcessed ? <Badge tone="green">Đã xử lý</Badge> : null}
                <LatenessDot dueAt={order.dueAt} isLate={order.isLate} />
              </View>
            </View>
            <InfoRow label="Ngày đặt" value={formatDateVN(order.orderDate)} />
            <InfoRow label="Người đặt" value={order.createdBy?.name ?? "—"} />
            <InfoRow label="Hạn nộp" value={order.dueAt ? formatDateVN(order.dueAt) : "Chưa tính hạn"} />
            <InfoRow label="Đã xử lý" value={order.processedAt ? formatDateVN(order.processedAt) : "Chưa xử lý"} />
            {/* Chỉ hiện khi đơn đang được tích: `processedById` cố ý không bị xoá lúc bỏ tích (nó là
                dấu "đã báo quán một lần"), nên hiện vô điều kiện sẽ thành "người xử lý" của một đơn
                đang mang dấu chưa xử lý. */}
            <InfoRow label="Người xử lý" value={isProcessed ? (order.processedBy?.name ?? "—") : "—"} />
            {order.note ? <InfoRow label="Ghi chú" value={order.note} /> : null}
          </CardBody>
        </Card>

        {canApprove && order.status !== "CANCELLED" ? (
          <Button
            title={isProcessed ? "Bỏ tích đã xử lý" : "Đánh dấu đã xử lý"}
            variant={isProcessed ? "secondary" : "primary"}
            fullWidth
            loading={setProcessed.isPending}
            icon={
              <Ionicons
                name={isProcessed ? "arrow-undo-outline" : "checkmark"}
                size={18}
                color={isProcessed ? colors.text : colors.onPrimary}
              />
            }
            onPress={() => setProcessed.mutate(!isProcessed)}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá đề xuất</CardTitle>
            <Text style={styles.count}>{order.items.length} dòng</Text>
          </CardHeader>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.product?.name ?? "—"}</Text>
              <Text style={styles.itemMeta}>
                {item.product?.code} · {item.product?.unit?.name ?? ""}
              </Text>
              <InfoRow label="SL đặt" value={formatNumber(item.quantity)} />
            </View>
          ))}
        </Card>

        {canCancel ? (
          <Button title="Huỷ đơn" variant="danger" fullWidth loading={updateStatus.isPending} onPress={handleCancel} />
        ) : null}
      </Screen>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: { paddingTop: spacing.lg, gap: 6 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.sm },
  code: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  badges: { alignItems: "flex-end", gap: spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: "right", fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint, marginBottom: spacing.xs },
});
