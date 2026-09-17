import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import {
  useCompleteSalesOrderReceiving,
  useConfirmOrderReportedQuantities,
  useSalesOrder,
  useUpdateSalesOrderReceivedDates,
  useUpdateSalesOrderStatus,
} from "@/hooks/useSalesOrders";
import { formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { SALES_ORDER_STATUS_TONE } from "@/lib/salesOrder";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { SalesOrderItem } from "@/types";

export default function OrderDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();
  const { can } = useCan();

  const { data: order, isLoading, isRefetching, refetch } = useSalesOrder(id);
  const updateStatus = useUpdateSalesOrderStatus(id);
  const completeReceiving = useCompleteSalesOrderReceiving(id);
  const confirmQuantities = useConfirmOrderReportedQuantities(id);
  const updateReceivedDates = useUpdateSalesOrderReceivedDates(id);

  /** Chỉ giữ dòng người dùng thực sự chạm tới; dòng chưa chạm rơi về giá trị đã lưu hoặc SL đặt. */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dateOverrides, setDateOverrides] = useState<Record<string, Date>>({});
  const [bulkReceivedAt, setBulkReceivedAt] = useState(() => new Date());

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
  const canReceiveOrders = can("ORDERS", "RECEIVE");
  const canReceive = canReceiveOrders && (order.status === "CONFIRMED" || order.status === "SHORT");
  // Chỉ ORDERS.APPROVE được đặt ngày nhận; quán chỉ điền số lượng. Sửa được ở mọi trạng thái sau khi
  // đơn đã xác nhận (kể cả Hoàn thành), nếu không thì ngày sai sẽ bị khoá cứng.
  const canEditDates =
    canApprove && (order.status === "CONFIRMED" || order.status === "SHORT" || order.status === "COMPLETED");

  /** ORDERS.APPROVE huỷ được ở mọi trạng thái còn mở; ORDERS.ADD chỉ huỷ được khi đơn chưa xác nhận. */
  const canCancel = canApprove
    ? ["DRAFT", "PENDING_CONFIRM", "CONFIRMED", "SHORT"].includes(order.status)
    : can("ORDERS", "ADD") && order.status === "DRAFT";

  function receivedQuantityFor(item: SalesOrderItem): string {
    const override = overrides[item.id];
    if (override !== undefined) return override;
    if (item.receivedQuantity != null) return String(item.receivedQuantity);
    return String(item.quantity);
  }

  /**
   * Dòng đã nhận từ đợt trước GIỮ NGUYÊN ngày cũ — nếu lấy mặc định hôm nay thì mỗi lần mở lại đơn
   * thiếu để nhận bổ sung, toàn bộ ngày sẽ nhảy sang hôm nay và Check Cost tính sai kỳ.
   */
  function receivedAtFor(item: SalesOrderItem): Date {
    const override = dateOverrides[item.id];
    if (override !== undefined) return override;
    if (item.receivedAt) return new Date(item.receivedAt);
    return bulkReceivedAt;
  }

  /** Tổng số lượng dòng phiếu xuất kho cho hàng hoá này — số admin báo lấy được từ NCC. */
  function reportedQuantityFor(item: SalesOrderItem): number {
    return (order?.stockExport?.items ?? [])
      .filter((line) => line.productId === item.productId)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
  }

  function fillAllWithOrdered() {
    const next: Record<string, string> = {};
    for (const item of order!.items) next[item.id] = String(item.quantity);
    setOverrides(next);
  }

  function applyBulkDateToAll() {
    const next: Record<string, Date> = {};
    for (const item of order!.items) next[item.id] = bulkReceivedAt;
    setDateOverrides(next);
  }

  function handleSaveDates() {
    const items = order!.items.map((item) => ({ itemId: item.id, receivedAt: receivedAtFor(item).toISOString() }));
    updateReceivedDates.mutate(items, {
      onSuccess: (updated) => {
        setDateOverrides({});
        if (updated.affectedCostChecks.length > 0) {
          const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
          Alert.alert(
            "Đã lưu ngày nhận",
            `Các phiếu Check Cost sau có kỳ trùm ngày cũ hoặc ngày mới — số liệu của chúng CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
          );
        }
      },
    });
  }

  function handleComplete() {
    const items = order!.items.map((item) => ({
      itemId: item.id,
      receivedQuantity: Number(receivedQuantityFor(item)) || 0,
      receivedAt: receivedAtFor(item).toISOString(),
    }));
    completeReceiving.mutate(items, {
      onSuccess: () => {
        setOverrides({});
        setDateOverrides({});
      },
    });
  }

  function handleCancel() {
    Alert.alert("Huỷ đơn hàng", "Bạn có chắc muốn huỷ đơn hàng này?", [
      { text: "Không", style: "cancel" },
      { text: "Huỷ đơn", style: "destructive", onPress: () => updateStatus.mutate("CANCELLED") },
    ]);
  }

  const showReported = order.status === "PENDING_CONFIRM";

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
            {order.note ? <InfoRow label="Ghi chú" value={order.note} /> : null}
          </CardBody>
        </Card>

        {canApprove && order.status === "DRAFT" ? (
          <Button title="Xác nhận đơn" fullWidth onPress={() => router.push(`/orders/${order.id}/confirm`)} />
        ) : null}

        {canReceiveOrders && order.status === "PENDING_CONFIRM" ? (
          <Button
            title="Xác nhận số lượng báo"
            fullWidth
            loading={confirmQuantities.isPending}
            onPress={() => confirmQuantities.mutate()}
          />
        ) : null}

        {canEditDates ? (
          <Card>
            <CardHeader>
              <CardTitle>Ngày nhận</CardTitle>
            </CardHeader>
            <CardBody style={styles.bulkBody}>
              <DateTimeField label="Ngày nhận mặc định" value={bulkReceivedAt} onChange={setBulkReceivedAt} />
              <Button title="Áp cho tất cả dòng" variant="secondary" size="sm" onPress={applyBulkDateToAll} />
              <Button
                title="Lưu ngày nhận"
                size="sm"
                loading={updateReceivedDates.isPending}
                onPress={handleSaveDates}
              />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá</CardTitle>
            <Text style={styles.count}>{order.items.length} dòng</Text>
          </CardHeader>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.product?.name ?? "—"}</Text>
              <Text style={styles.itemMeta}>
                {item.product?.code} · {item.product?.unit?.name ?? ""}
              </Text>
              <InfoRow label="SL đặt" value={formatNumber(item.quantity)} />
              {showReported ? <InfoRow label="SL báo" value={formatNumber(reportedQuantityFor(item))} /> : null}
              {!canReceive && item.receivedQuantity != null ? (
                <InfoRow label="SL thực nhận" value={formatNumber(item.receivedQuantity)} />
              ) : null}
              {!canEditDates && item.receivedAt ? (
                <InfoRow label="Ngày nhận" value={formatDateVN(item.receivedAt)} />
              ) : null}

              {canReceive ? (
                <Input
                  label="SL thực nhận"
                  value={receivedQuantityFor(item)}
                  onChangeText={(value) => setOverrides((prev) => ({ ...prev, [item.id]: value }))}
                  keyboardType="numeric"
                  containerStyle={styles.itemInput}
                />
              ) : null}

              {canEditDates ? (
                <View style={styles.itemInput}>
                  <DateTimeField
                    label="Ngày nhận dòng này"
                    value={receivedAtFor(item)}
                    onChange={(date) => setDateOverrides((prev) => ({ ...prev, [item.id]: date }))}
                  />
                </View>
              ) : null}

              {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
            </View>
          ))}
        </Card>

        {canReceive ? (
          <>
            <Button title="Điền SL theo đã đặt" variant="secondary" fullWidth onPress={fillAllWithOrdered} />
            <Button title="Hoàn thành nhận hàng" fullWidth loading={completeReceiving.isPending} onPress={handleComplete} />
          </>
        ) : null}

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
  bulkBody: { gap: spacing.md, paddingTop: spacing.xs },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint, marginBottom: spacing.xs },
  itemInput: { marginTop: spacing.sm },
  itemNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
