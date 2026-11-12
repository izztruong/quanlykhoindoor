import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { InfoRow } from "@/components/ui/InfoRow";
import { Input } from "@/components/ui/Input";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useBakeryOrder, useBakeryOrderAction } from "@/hooks/useBakeryOrders";
import { BAKERY_ORDER_STATUS_LABEL, BAKERY_ORDER_STATUS_TONE, parseQty } from "@/lib/bakeryOrder";
import { formatDateOnly, formatDateVN, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { AffectedCostCheck, BakeryOrder, BakeryOrderItem } from "@/types";

/** Cột số lượng của từng bước, theo đúng thứ tự luồng — giống BakeryOrderDetailClient bên web. */
const STEPS = [
  { key: "orderedQty", label: "Đặt" },
  { key: "confirmedQty", label: "Tiệm bánh XN" },
  { key: "pickedUpQty", label: "VC lấy" },
  { key: "receivedQty", label: "Quán nhận" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/** Bước đang chờ nhập ở từng trạng thái, và cột của bước trước để điền sẵn. */
const ACTIVE_STEP: Partial<Record<BakeryOrder["status"], { column: StepKey; prefillFrom: StepKey }>> = {
  ORDERED: { column: "confirmedQty", prefillFrom: "orderedQty" },
  CONFIRMED: { column: "pickedUpQty", prefillFrom: "confirmedQty" },
  IN_TRANSIT: { column: "receivedQty", prefillFrom: "pickedUpQty" },
};

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

function showAffected(list: AffectedCostCheck[]) {
  if (list.length === 0) return;
  Alert.alert(
    "Cần tạo lại phiếu Check Cost",
    `Ngày nhận nằm trong kỳ của ${list.length} phiếu Check Cost đã chốt (${list.map((cc) => cc.code).join(", ")}). ` +
      "Hãy tạo lại những phiếu đó để số liệu khớp.",
  );
}

/**
 * Chi tiết đơn bánh. Quán đặt → tiệm bánh xác nhận → vận chuyển lấy → quán nhận; mỗi bước nhập lại
 * số lượng của MỌI dòng (điền sẵn bằng số của bước trước). Quán nhận xong thì server tự sinh phiếu
 * nhập kho cho kho quán.
 */
export default function BakeryOrderDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? "";
  const router = useRouter();
  const { user, can, scopeAll } = useCan();
  const { data: order, isLoading, isRefetching, refetch } = useBakeryOrder(id);
  const actions = useBakeryOrderAction(id);

  // Ô nhập của bước đang chờ (hoặc của lần admin sửa SL nhận). null = chưa gõ gì, dùng số điền sẵn.
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [receivedAt, setReceivedAt] = useState<Date | null>(null);
  const [editingReceived, setEditingReceived] = useState(false);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Order bánh" }} />
        <LoadingState />
      </>
    );
  }
  if (!order) {
    return (
      <>
        <Stack.Screen options={{ title: "Order bánh" }} />
        <ErrorState message="Không tìm thấy order bánh" />
      </>
    );
  }

  const items = order.items ?? [];
  const isBakerySide = scopeAll || user?.id === order.supplier.bakeryUserId;
  const isShopSide = scopeAll || user?.id === order.shopUserId;

  // Ai được nhập ở bước đang chờ. Server chốt lại y như vậy — đây chỉ để ẩn nút.
  const canActNow =
    (order.status === "ORDERED" && can("BAKERY_ORDERS", "CONFIRM") && isBakerySide) ||
    (order.status === "CONFIRMED" && can("BAKERY_ORDERS", "PICKUP")) ||
    (order.status === "IN_TRANSIT" && can("BAKERY_ORDERS", "RECEIVE") && isShopSide);
  const canCancel = order.status === "ORDERED" && can("BAKERY_ORDERS", "CANCEL") && isShopSide;
  const canReject = order.status === "ORDERED" && can("BAKERY_ORDERS", "CONFIRM") && isBakerySide;
  const canEditReceived = order.status === "COMPLETED" && can("BAKERY_ORDERS", "EDIT");

  const active = editingReceived
    ? { column: "receivedQty" as StepKey, prefillFrom: "receivedQty" as StepKey }
    : ACTIVE_STEP[order.status];
  const inputColumn = canActNow || editingReceived ? active?.column : undefined;
  const values: Record<string, string> =
    draft ??
    Object.fromEntries(items.map((it) => [it.productId, String(num(it[active?.prefillFrom ?? "orderedQty"]) ?? "")]));
  const showReceivedAt = inputColumn === "receivedQty";
  const effectiveReceivedAt =
    receivedAt ?? (editingReceived && order.receivedAt ? new Date(order.receivedAt) : new Date());

  const pending =
    actions.confirm.isPending ||
    actions.reject.isPending ||
    actions.cancel.isPending ||
    actions.pickUp.isPending ||
    actions.receive.isPending ||
    actions.editReceived.isPending;

  const reset = () => {
    setDraft(null);
    setReceivedAt(null);
    setEditingReceived(false);
  };

  function collect() {
    const result = items.map((it) => ({ productId: it.productId, quantity: parseQty(values[it.productId] ?? "") }));
    if (result.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
      Alert.alert("Số lượng chưa hợp lệ", "Mỗi dòng cần một số lượng từ 0 trở lên.");
      return null;
    }
    return result;
  }

  function submitStep() {
    const stepItems = collect();
    if (!stepItems) return;
    const at = effectiveReceivedAt.toISOString();
    const afterReceive = {
      onSuccess: (result: BakeryOrder & { affectedCostChecks: AffectedCostCheck[] }) => {
        reset();
        showAffected(result.affectedCostChecks);
      },
    };
    if (editingReceived) actions.editReceived.mutate({ items: stepItems, receivedAt: at }, afterReceive);
    else if (order!.status === "ORDERED") actions.confirm.mutate(stepItems, { onSuccess: reset });
    else if (order!.status === "CONFIRMED") actions.pickUp.mutate(stepItems, { onSuccess: reset });
    else if (order!.status === "IN_TRANSIT") actions.receive.mutate({ items: stepItems, receivedAt: at }, afterReceive);
  }

  function confirmThen(title: string, message: string, label: string, run: () => void) {
    Alert.alert(title, message, [
      { text: "Không", style: "cancel" },
      { text: label, style: "destructive", onPress: run },
    ]);
  }

  const submitLabel = editingReceived
    ? "Lưu số lượng nhận"
    : order.status === "ORDERED"
      ? "Xác nhận đơn"
      : order.status === "CONFIRMED"
        ? "Xác nhận đã lấy hàng"
        : "Xác nhận đã nhận hàng";

  const bakeryShort = items.reduce(
    (sum, it) => (it.confirmedQty == null ? sum : sum + Number(it.orderedQty) - Number(it.confirmedQty)),
    0,
  );
  const transitLoss = items.reduce(
    (sum, it) =>
      it.pickedUpQty == null || it.receivedQty == null ? sum : sum + Number(it.pickedUpQty) - Number(it.receivedQty),
    0,
  );

  /** Ô lệch với bước liền trước thì tô màu — lệch ở đâu là thấy ngay ở đó. */
  function differsFromPrevious(it: BakeryOrderItem, stepIndex: number) {
    if (stepIndex === 0) return false;
    const current = num(it[STEPS[stepIndex].key]);
    const previous = num(it[STEPS[stepIndex - 1].key]);
    return current != null && previous != null && current !== previous;
  }

  return (
    <>
      <Stack.Screen options={{ title: order.code }} />
      <Screen refreshing={isRefetching} onRefresh={() => refetch()}>
        <Card>
          <CardBody style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.code}>{order.code}</Text>
              <Badge tone={BAKERY_ORDER_STATUS_TONE[order.status]}>{BAKERY_ORDER_STATUS_LABEL[order.status]}</Badge>
            </View>
            <InfoRow label="Quán" value={order.shopUser.name} />
            <InfoRow label="Tiệm bánh" value={order.supplier.name} />
            <InfoRow label="Ngày giao" value={formatDateOnly(order.deliveryOn)} />
            {order.note ? <InfoRow label="Ghi chú" value={order.note} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Số lượng qua từng bước</CardTitle>
            <Text style={styles.muted}>{items.length} loại</Text>
          </CardHeader>
          {items.map((it) => {
            const loss =
              it.pickedUpQty != null && it.receivedQty != null ? Number(it.pickedUpQty) - Number(it.receivedQty) : null;
            const unit = it.product.unit?.name;
            return (
              <View key={it.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{it.product.name}</Text>
                <Text style={styles.itemMeta}>
                  {it.product.code}
                  {unit ? ` · ${unit}` : ""}
                </Text>
                {STEPS.map((step, stepIndex) =>
                  step.key === inputColumn ? (
                    <Input
                      key={step.key}
                      label={unit ? `${step.label} (${unit})` : step.label}
                      keyboardType="decimal-pad"
                      value={values[it.productId] ?? ""}
                      onChangeText={(text) => setDraft({ ...values, [it.productId]: text })}
                    />
                  ) : (
                    <View key={step.key} style={styles.stepRow}>
                      <Text style={styles.stepLabel}>{step.label}</Text>
                      <Text style={[styles.stepValue, differsFromPrevious(it, stepIndex) && styles.stepDiff]}>
                        {num(it[step.key]) == null ? "—" : formatNumber(num(it[step.key])!)}
                      </Text>
                    </View>
                  ),
                )}
                {loss != null ? (
                  <View style={styles.stepRow}>
                    <Text style={styles.stepLabel}>Hao hụt VC</Text>
                    <Text style={[styles.stepValue, loss > 0 && styles.lossText]}>{formatNumber(loss)}</Text>
                  </View>
                ) : null}
                {it.note ? <Text style={styles.itemNote}>Ghi chú: {it.note}</Text> : null}
              </View>
            );
          })}
          {bakeryShort > 0 || transitLoss > 0 ? (
            <CardBody style={styles.notes}>
              {bakeryShort > 0 ? (
                <Text style={styles.warnText}>Tiệm bánh xác nhận thiếu {formatNumber(bakeryShort)} so với số đặt.</Text>
              ) : null}
              {transitLoss > 0 ? (
                <Text style={styles.lossText}>
                  Hao hụt vận chuyển {formatNumber(transitLoss)}: vận chuyển lấy nhiều hơn số quán nhận. Tiệm bánh tự làm
                  việc với người vận chuyển.
                </Text>
              ) : null}
            </CardBody>
          ) : null}
        </Card>

        {inputColumn ? (
          <Card>
            <CardBody style={styles.actionCard}>
              {showReceivedAt ? (
                <DateTimeField
                  label="Thời gian nhận"
                  required
                  value={effectiveReceivedAt}
                  onChange={setReceivedAt}
                  maximumDate={new Date()}
                />
              ) : null}
              <Button title={submitLabel} fullWidth loading={pending} onPress={submitStep} />
              {editingReceived ? (
                <Button title="Bỏ sửa" variant="secondary" fullWidth disabled={pending} onPress={reset} />
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        {canEditReceived && !editingReceived ? (
          <Button
            title="Sửa SL nhận / ngày nhận"
            variant="secondary"
            fullWidth
            onPress={() => setEditingReceived(true)}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Các bước</CardTitle>
          </CardHeader>
          <CardBody style={styles.infoCard}>
            <StepLine label="Quán đặt" who={order.createdBy?.name} at={order.createdAt} />
            <StepLine label="Tiệm bánh xác nhận" who={order.confirmedBy?.name} at={order.confirmedAt} />
            <StepLine label="Vận chuyển lấy hàng" who={order.pickedUpBy?.name} at={order.pickedUpAt} />
            <StepLine label="Quán nhận hàng" who={order.receivedBy?.name} at={order.receivedAt} />
            {order.status === "CANCELLED" ? (
              <StepLine label="Huỷ / từ chối" who={order.cancelledBy?.name} at={order.cancelledAt} />
            ) : null}
            {order.stockImport ? (
              <Pressable onPress={() => router.push(`/stock/imports/${order.stockImport!.id}`)} style={styles.stepLine}>
                <Text style={styles.muted}>Phiếu nhập kho tự sinh</Text>
                <Text style={styles.link}>{order.stockImport.code}</Text>
              </Pressable>
            ) : null}
          </CardBody>
        </Card>

        {canReject ? (
          <Button
            title="Từ chối đơn"
            variant="danger"
            fullWidth
            disabled={pending}
            onPress={() =>
              confirmThen("Từ chối đơn", `Từ chối đơn ${order.code}?`, "Từ chối", () =>
                actions.reject.mutate(undefined, { onSuccess: reset }),
              )
            }
          />
        ) : null}
        {canCancel ? (
          <Button
            title="Huỷ đơn"
            variant="danger"
            fullWidth
            disabled={pending}
            onPress={() =>
              confirmThen("Huỷ order bánh", `Huỷ đơn ${order.code}?`, "Huỷ đơn", () =>
                actions.cancel.mutate(undefined, { onSuccess: reset }),
              )
            }
          />
        ) : null}
      </Screen>
    </>
  );
}

function StepLine({ label, who, at }: { label: string; who?: string | null; at?: string | null }) {
  return (
    <View style={styles.stepLine}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={at ? styles.stepWho : styles.stepPending}>{at ? `${who ?? "—"} · ${formatDateVN(at)}` : "Chưa tới"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  infoCard: { paddingTop: spacing.lg, gap: spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  code: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint, marginBottom: spacing.xs },
  itemNote: { fontSize: fontSize.xs, color: colors.textMuted },
  stepRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  stepLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  stepValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  stepDiff: { color: colors.warning },
  lossText: { fontSize: fontSize.sm, color: colors.danger, fontWeight: "600" },
  warnText: { fontSize: fontSize.sm, color: colors.warning },
  notes: { gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  actionCard: { gap: spacing.md, paddingTop: spacing.lg },
  stepLine: { gap: 2 },
  stepWho: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  stepPending: { fontSize: fontSize.sm, color: colors.textFaint },
  link: { fontSize: fontSize.sm, color: colors.primary, fontWeight: "600" },
});
