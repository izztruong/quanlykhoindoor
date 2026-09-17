import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { GroupSection } from "@/components/ui/GroupSection";
import { InfoRow } from "@/components/ui/InfoRow";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useCostCheck, useUpdateCostCheckStatus } from "@/hooks/useCostChecks";
import { actualOverTheoreticalPct, buildCostRatioRows, groupCostReport, varianceTone } from "@/lib/costCheck";
import { formatCurrency, formatDateTime, formatNumber, formatPercent, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { CostCheckReportRow, ProductType } from "@/types";

export function CostCheckDetail({ id }: { id: string }) {
  const { can } = useCan();
  const query = useCostCheck(can("COST_CHECKS") ? id : "");
  const updateStatus = useUpdateCostCheckStatus(id);
  const [openType, setOpenType] = useState<ProductType | null>(null);
  const r = query.data;
  const grouped = useMemo(() => groupCostReport(r?.report ?? []), [r?.report]);

  function toggleStatus() {
    if (!r || !can("COST_CHECKS", "EDIT") || updateStatus.isPending) return;
    const next = r.status === "CANCELLED" ? "ACTIVE" : "CANCELLED";
    Alert.alert(next === "CANCELLED" ? "Huỷ phiếu" : "Bỏ huỷ",
      next === "CANCELLED"
        ? "Huỷ phiếu Check Cost này? Phiếu vẫn được giữ lại trong danh sách nhưng đánh dấu là đã huỷ."
        : "Bỏ huỷ phiếu Check Cost này?", [
        { text: "Đóng", style: "cancel" },
        { text: "Xác nhận", style: next === "CANCELLED" ? "destructive" : "default", onPress: () => updateStatus.mutate(next) },
      ]);
  }

  const summary = r?.financialSummary;
  const revenues = summary ? [
    { label: "Trà", revenue: summary.revenueTra, discount: summary.discountTra, net: summary.netRevenueTra },
    { label: "ĐAV", revenue: summary.revenueDav, discount: summary.discountDav, net: summary.netRevenueDav },
    { label: "Tổng", revenue: summary.revenueTotal, discount: summary.discountTotal, net: summary.netRevenueTotal },
  ] : [];

  return <>
    <Stack.Screen options={{ title: r?.code ?? "Chi tiết Check Cost" }} />
    {!can("COST_CHECKS") ? <ErrorState message="Bạn không có quyền xem phiếu Check Cost." /> : query.isLoading ? <LoadingState /> : !r ?
      <Screen><ErrorState message={query.error?.message ?? "Không tìm thấy phiếu."} />
        <Button title="Thử lại" variant="secondary" onPress={() => query.refetch()} /></Screen> :
      <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
        {query.error && <ErrorState message={query.error.message} />}
        <Card>
          <CardHeader><CardTitle>{r.code}</CardTitle>
            <Badge tone={r.status === "CANCELLED" ? "red" : "green"}>{r.status === "CANCELLED" ? "Đã huỷ" : "Hiệu lực"}</Badge>
          </CardHeader>
          <CardBody style={styles.fields}>
            <InfoRow label="Quán" value={r.user?.name ?? "—"} />
            <InfoRow label="Đầu kỳ" value={`${r.openingStockCheck.code} — ${formatDateTime(r.openingStockCheck.checkedAt)}`} />
            <InfoRow label="Cuối kỳ" value={`${r.closingStockCheck.code} — ${formatDateTime(r.closingStockCheck.checkedAt)}`} />
            <InfoRow label="Người tạo" value={r.createdBy?.name ?? "—"} />
            {r.note ? <InfoRow label="Ghi chú" value={r.note} /> : null}
          </CardBody>
        </Card>
        {can("COST_CHECKS", "EDIT") && <Button title={r.status === "CANCELLED" ? "Bỏ huỷ" : "Huỷ phiếu"}
          variant={r.status === "CANCELLED" ? "secondary" : "danger"} loading={updateStatus.isPending} onPress={toggleStatus} />}
        {revenues.map((revenue) => <Card key={revenue.label}>
          <CardHeader><CardTitle>Doanh thu {revenue.label}</CardTitle></CardHeader>
          <CardBody style={styles.fields}>
            <InfoRow label="Tổng doanh thu" value={formatCurrency(revenue.revenue)} />
            <InfoRow label="Khuyến mãi" value={formatCurrency(revenue.discount)} />
            <InfoRow label="Doanh thu thuần" value={formatCurrency(revenue.net)} />
          </CardBody>
        </Card>)}
        {summary && <Card>
          <CardHeader><CardTitle>Chi phí</CardTitle></CardHeader>
          <CardBody style={styles.fields}>
            {buildCostRatioRows(summary).map((row) => <View key={row.label} style={styles.costRow}>
              <Text style={styles.name}>{row.label}</Text>
              <InfoRow label="Giá trị" value={formatCurrency(row.value)} />
              <InfoRow label="% trên doanh thu" value={formatPercent(row.pct)} />
            </View>)}
          </CardBody>
        </Card>}
        <Card>
          <CardHeader><CardTitle>Món đã bán trong kỳ</CardTitle></CardHeader>
          <CardBody style={styles.fields}>
            {(r.soldItems ?? []).map((item) => <InfoRow key={item.id} label={item.finishedGoodItem.name}
              value={`${formatNumber(item.quantitySold)} ${item.finishedGoodItem.unit?.name ?? ""}`} />)}
            {!r.soldItems?.length && <Text style={styles.muted}>Không có món đã bán.</Text>}
          </CardBody>
        </Card>
        <CardTitle>Báo cáo nguyên liệu</CardTitle>
        <Text style={styles.muted}>
          <Text style={{ color: colors.danger }}>Đỏ</Text> — dùng vượt định mức;{" "}
          <Text style={{ color: colors.success }}>xanh</Text> — dùng ít hơn định mức; xám — khớp định mức.
        </Text>
        {!grouped.length && <Text style={styles.muted}>Không có dữ liệu nguyên liệu nào để đối soát.</Text>}
        {grouped.map(({ type, groups }) => <GroupSection key={type} label={labels.productType(type)}
          count={groups.reduce((total, [, rows]) => total + rows.length, 0)} open={openType === type}
          onToggle={() => setOpenType((previous) => previous === type ? null : type)}>
          {openType === type && groups.map(([name, rows]) => <View key={name} style={styles.group}>
            <Text style={styles.groupName}>{name}</Text>
            {rows.map((row) => <MaterialCard key={row.productId} row={row} />)}
          </View>)}
        </GroupSection>)}
      </Screen>}
  </>;
}

function MaterialCard({ row }: { row: CostCheckReportRow }) {
  const tone = varianceTone(row.variance);
  const color = tone === "red" ? colors.danger : tone === "green" ? colors.success : colors.textMuted;
  const pct = actualOverTheoreticalPct(row);
  const metrics = [
    { label: "Tồn đầu kỳ", value: formatNumber(row.openingQty) },
    { label: "Nhận trong kỳ", value: formatNumber(row.receivedQty) },
    { label: "Đã huỷ", value: formatNumber(row.wastedQty) },
    { label: "Xuất trong kỳ", value: formatNumber(row.transferOutQty) },
    { label: "Tồn cuối kỳ", value: formatNumber(row.closingQty) },
    { label: "Thực tế dùng", value: formatNumber(row.actualUsed) },
    { label: "Theo công thức", value: formatNumber(row.theoretical) },
    { label: "Chênh lệch", value: formatNumber(row.variance), color },
    { label: "% thực tế / công thức", value: pct === null ? "—" : formatPercent(pct), color },
  ];
  return <View style={styles.material}>
    <Text style={styles.name}>{row.name} · {row.unitLabel}</Text>
    <View style={styles.grid}>{metrics.map((metric) => <View key={metric.label} style={styles.metric}>
      <Text style={styles.muted}>{metric.label}</Text>
      <Text style={[styles.value, { color: metric.color ?? colors.text }]}>{metric.value}</Text>
    </View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  name: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  costRow: { gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  group: { padding: spacing.md, gap: spacing.md },
  groupName: { fontSize: fontSize.md, fontWeight: "700", color: colors.textMuted },
  material: { padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.md, rowGap: spacing.md },
  metric: { width: "46%", gap: spacing.xs },
  value: { fontSize: fontSize.md, fontWeight: "600" },
});
