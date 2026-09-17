import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { LatenessDot } from "@/components/deadlines/LatenessDot";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useStockCheck } from "@/hooks/useStockChecks";
import { stockCheckTypeLabel } from "@/lib/deadlines";
import { formatDateVN, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function StockCheckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useCan();
  const check = useStockCheck(id ?? "");

  if (check.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: "Phiếu kiểm kê" }} />
        <LoadingState />
      </>
    );
  }

  if (!check.data) {
    return (
      <>
        <Stack.Screen options={{ title: "Phiếu kiểm kê" }} />
        <ErrorState message="Không tìm thấy phiếu kiểm" />
      </>
    );
  }

  const data = check.data;
  const items = data.items ?? [];
  const finishedItems = data.finishedItems ?? [];

  return (
    <>
      <Stack.Screen options={{ title: data.code }} />
      <Screen refreshing={check.isRefetching} onRefresh={() => check.refetch()}>
        <Card>
          <CardBody style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.code}>{data.code}</Text>
              <LatenessDot dueAt={data.dueAt} isLate={data.isLate} />
            </View>
            <InfoRow label="Loại phiếu" value={data.type ? stockCheckTypeLabel[data.type] : "—"} />
            <InfoRow label="Thời điểm kiểm" value={formatDateVN(data.checkedAt)} />
            <InfoRow label="Thời điểm nộp" value={formatDateVN(data.createdAt)} />
            <InfoRow label="Hạn nộp" value={data.dueAt ? formatDateVN(data.dueAt) : "Chưa tính hạn"} />
            <InfoRow label="Người tạo" value={data.createdBy?.name ?? "—"} />
            {data.note ? <InfoRow label="Ghi chú" value={data.note} /> : null}
          </CardBody>
        </Card>

        {can("STOCK_CHECKS", "EDIT") ? (
          <Button
            title="Sửa phiếu"
            variant="secondary"
            fullWidth
            icon={<Ionicons name="pencil" size={16} color={colors.text} />}
            onPress={() => router.push(`/stock-checks/${data.id}/edit`)}
          />
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Nguyên liệu</CardTitle>
            <Text style={styles.count}>{items.length} dòng</Text>
          </CardHeader>
          {items.length === 0 ? (
            <CardBody>
              <Text style={styles.empty}>Không có dòng nguyên liệu.</Text>
            </CardBody>
          ) : (
            items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.product?.name ?? "—"}</Text>
                <Text style={styles.itemMeta}>
                  {item.product?.code} · {item.product?.unit?.name ?? ""}
                </Text>
                <View style={styles.quantities}>
                  <Text style={styles.quantity}>
                    Chẵn: <Text style={styles.quantityValue}>{item.wholeQuantity != null ? formatNumber(item.wholeQuantity) : "—"}</Text>
                  </Text>
                  <Text style={styles.quantity}>
                    Lẻ: <Text style={styles.quantityValue}>{item.looseQuantity != null ? formatNumber(item.looseQuantity) : "—"}</Text>
                    {item.product?.recipeUnit?.name ? ` ${item.product.recipeUnit.name}` : ""}
                  </Text>
                </View>
                {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              </View>
            ))
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Đồ thành phẩm</CardTitle>
            <Text style={styles.count}>{finishedItems.length} dòng</Text>
          </CardHeader>
          {finishedItems.length === 0 ? (
            <CardBody>
              <Text style={styles.empty}>Không có dòng đồ thành phẩm.</Text>
            </CardBody>
          ) : (
            finishedItems.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.finishedGoodItem?.name ?? "—"}</Text>
                <Text style={styles.itemMeta}>
                  {item.finishedGoodItem?.code} · {item.finishedGoodItem?.unit?.name ?? ""}
                </Text>
                <Text style={styles.quantity}>
                  Số lượng: <Text style={styles.quantityValue}>{formatNumber(item.quantity)}</Text>
                </Text>
                {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}
              </View>
            ))
          )}
        </Card>
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
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  code: { fontSize: fontSize.xl, fontWeight: "700", color: colors.text },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: "right", fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  count: { fontSize: fontSize.sm, color: colors.textMuted },
  empty: { fontSize: fontSize.sm, color: colors.textFaint },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint },
  quantities: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs },
  quantity: { fontSize: fontSize.sm, color: colors.textMuted },
  quantityValue: { color: colors.text, fontWeight: "700" },
  itemNote: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
