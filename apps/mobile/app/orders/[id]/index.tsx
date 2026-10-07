import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { OrderItemImagesModal } from "@/components/orders/OrderItemImagesModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useSalesOrder, useUpdateSalesOrderStatus } from "@/hooks/useSalesOrders";
import { formatCurrency, formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { SALES_ORDER_STATUS_TONE } from "@/lib/salesOrder";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { SalesOrderItem } from "@/types";

/**
 * Chi tiết đơn chỉ đọc. Nhập NCC / giá / SL + ngày nhận nằm ở màn "Xử lý đơn" (orders/[id]/process) —
 * dùng cho cả lần đầu lẫn sửa lại sau khi hoàn thành.
 */
export default function OrderDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();
  const { can } = useCan();

  const { data: order, isLoading, isRefetching, refetch } = useSalesOrder(id);
  const updateStatus = useUpdateSalesOrderStatus(id);
  // Giữ id chứ không giữ cả dòng: imageCount phải lấy từ dữ liệu đơn mới nhất sau mỗi lần tải/xoá ảnh.
  const [imagesItemId, setImagesItemId] = useState<string | null>(null);

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
  const isCompleted = order.status === "COMPLETED";
  // Server chỉ cho huỷ đơn chưa xử lý: APPROVE huỷ mọi đơn, ADD huỷ đơn của mình.
  const canCancel = order.status === "DRAFT" && (canApprove || can("ORDERS", "ADD"));
  const imagesItem = imagesItemId ? order.items.find((item) => item.id === imagesItemId) : undefined;

  /** Các dòng phiếu xuất của hàng hoá này — mỗi dòng một NCC (một hàng có thể tách nhiều NCC). */
  function exportLinesFor(item: SalesOrderItem) {
    return (order?.stockExport?.items ?? []).filter((line) => line.productId === item.productId);
  }

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
                <LatenessDot dueAt={order.dueAt} isLate={order.isLate} />
              </View>
            </View>
            <InfoRow label="Kho hàng" value={order.warehouse?.name ?? "—"} />
            <InfoRow label="Ngày đặt" value={formatDateVN(order.orderDate)} />
            <InfoRow label="Người đặt" value={order.createdBy?.name ?? "—"} />
            <InfoRow label="Hạn nộp" value={order.dueAt ? formatDateVN(order.dueAt) : "Chưa tính hạn"} />
            <InfoRow label="Phiếu xuất kho" value={order.stockExport?.code ?? "Chưa xuất kho"} />
            {order.note ? <InfoRow label="Ghi chú" value={order.note} /> : null}
          </CardBody>
        </Card>

        {canApprove && order.status !== "CANCELLED" ? (
          <Button
            title={isCompleted ? "Sửa nhận hàng" : "Xử lý đơn"}
            fullWidth
            onPress={() => router.push(`/orders/${order.id}/process`)}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá</CardTitle>
            <Text style={styles.count}>{order.items.length} dòng</Text>
          </CardHeader>
          {order.items.map((item) => {
            const ordered = Number(item.quantity);
            const received = item.receivedQuantity != null ? Number(item.receivedQuantity) : null;
            // Hàng admin tự thêm lúc xử lý có SL đặt = 0 — không tô màu so với số đặt.
            const receivedStyle =
              received == null || ordered <= 0
                ? null
                : received < ordered
                  ? styles.short
                  : received > ordered
                    ? styles.over
                    : null;
            const lines = exportLinesFor(item);
            return (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.product?.name ?? "—"}</Text>
                <Text style={styles.itemMeta}>
                  {item.product?.code} · {item.product?.unit?.name ?? ""}
                </Text>
                <InfoRow label="SL đặt" value={ordered > 0 ? formatNumber(ordered) : "— (thêm mới)"} />
                {isCompleted ? (
                  <>
                    <InfoRow
                      label="SL nhận"
                      value={received != null ? formatNumber(received) : "—"}
                      valueStyle={receivedStyle}
                    />
                    {lines.map((line) => (
                      <InfoRow
                        key={line.id}
                        label={line.supplier?.name ?? "Không chọn NCC"}
                        value={`${formatNumber(line.quantity)} × ${formatCurrency(line.costPrice)}`}
                      />
                    ))}
                    {item.receivedAt ? <InfoRow label="Ngày nhận" value={formatDateVN(item.receivedAt)} /> : null}
                  </>
                ) : null}

                {isCompleted && (canApprove || item.imageCount > 0) ? (
                  <View style={styles.itemAction}>
                    <Button
                      title={`Chứng từ (${item.imageCount})`}
                      variant="secondary"
                      size="sm"
                      icon={<Ionicons name="camera-outline" size={16} color={colors.text} />}
                      onPress={() => setImagesItemId(item.id)}
                    />
                  </View>
                ) : null}

                {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              </View>
            );
          })}
        </Card>

        {canCancel ? (
          <Button title="Huỷ đơn" variant="danger" fullWidth loading={updateStatus.isPending} onPress={handleCancel} />
        ) : null}
      </Screen>

      {imagesItem ? (
        <OrderItemImagesModal
          orderId={order.id}
          item={imagesItem}
          canManage={canApprove && isCompleted}
          onClose={() => setImagesItemId(null)}
        />
      ) : null}
    </>
  );
}

function InfoRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object | null }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
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
  short: { color: colors.danger },
  over: { color: colors.success },
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
  itemAction: { marginTop: spacing.sm },
  itemNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
