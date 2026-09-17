import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatCurrency, formatPercent } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { DashboardCostMonth } from "@/types";

/** Bước lưới "tròn" nhỏ nhất sao cho giá trị lớn nhất nằm gọn trong 4 vạch. */
const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
const TICK_COUNT = 4;
const CHART_HEIGHT = 168;

function axisMax(maxValue: number) {
  const step = TICK_STEPS.find((s) => maxValue <= s * TICK_COUNT) ?? Math.ceil(maxValue / TICK_COUNT);
  return { step, max: step * TICK_COUNT };
}

/**
 * Cột = chi phí NVL / doanh thu thuần từng tháng, một trục % duy nhất — giữ đúng cách đọc của bản
 * web. Trên điện thoại không có hover nên chạm vào cột để xem số của tháng đó ngay dưới biểu đồ.
 */
export function MaterialCostChart({ months }: { months: DashboardCostMonth[] }) {
  const [active, setActive] = useState<number | null>(null);

  const hasData = months.some((m) => m.checkCount > 0);
  if (!hasData) {
    return <Text style={styles.empty}>Chưa có phiếu Check Cost nào chốt kỳ trong năm này.</Text>;
  }

  const { step, max } = axisMax(Math.max(...months.map((m) => m.pct), 0));
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => step * (TICK_COUNT - i));
  const selected = active === null ? null : months[active];

  return (
    <View style={styles.root}>
      <View style={styles.chartRow}>
        <View style={styles.axis}>
          {ticks.map((tick) => (
            <Text key={tick} style={styles.axisLabel}>
              {Math.round(tick * 100)}%
            </Text>
          ))}
        </View>

        <View style={styles.plotArea}>
          <View style={styles.grid}>
            {ticks.map((tick) => (
              <View key={tick} style={styles.gridLine} />
            ))}
          </View>

          <View style={styles.bars}>
            {months.map((m, index) => {
              const noData = m.checkCount === 0;
              // Tỷ lệ âm (tồn cuối kỳ khai lớn hơn đầu kỳ + nhận) không có cột; số thật vẫn ở phần chi tiết.
              const ratio = Math.min(Math.max(m.pct, 0) / max, 1);
              return (
                <Pressable
                  key={m.month}
                  style={styles.barSlot}
                  onPress={() => setActive(active === index ? null : index)}
                  accessibilityRole="button"
                  accessibilityLabel={`Tháng ${m.month}: ${noData ? "không có số liệu" : formatPercent(m.pct)}`}
                >
                  {noData ? null : (
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(ratio * CHART_HEIGHT, 2) },
                        active === index && styles.barActive,
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.monthRow}>
        <View style={styles.axisSpacer} />
        {months.map((m, index) => (
          <Text key={m.month} style={[styles.monthLabel, active === index && styles.monthLabelActive]}>
            T{m.month}
          </Text>
        ))}
      </View>

      {selected ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>
            Tháng {selected.month}/{selected.year}
          </Text>
          {selected.checkCount === 0 ? (
            <Text style={styles.detailMuted}>Không có phiếu Check Cost</Text>
          ) : (
            <>
              <DetailRow label="Tỷ lệ" value={formatPercent(selected.pct)} strong />
              <DetailRow label="Chi phí" value={formatCurrency(Math.round(selected.cost))} />
              <DetailRow label="Doanh thu" value={formatCurrency(Math.round(selected.netRevenue))} />
              <DetailRow label="Số phiếu" value={String(selected.checkCount)} />
            </>
          )}
        </View>
      ) : (
        <Text style={styles.hint}>Chạm vào cột để xem số liệu của tháng</Text>
      )}
    </View>
  );
}

function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailValueStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  chartRow: { flexDirection: "row", height: CHART_HEIGHT },
  axis: { width: 34, justifyContent: "space-between", alignItems: "flex-end", paddingRight: spacing.xs },
  // Nhãn trục cao 0 để chữ canh đúng vào vạch lưới thay vì đẩy nhau xuống.
  axisLabel: { fontSize: 10, color: colors.textFaint, height: 12, marginVertical: -6 },
  axisSpacer: { width: 34 },
  plotArea: { flex: 1 },
  grid: { ...StyleSheet.absoluteFill, justifyContent: "space-between" },
  gridLine: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end" },
  barSlot: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "55%", maxWidth: 18, backgroundColor: colors.primary, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barActive: { backgroundColor: colors.primaryPressed },
  monthRow: { flexDirection: "row", marginTop: spacing.xs },
  monthLabel: { flex: 1, textAlign: "center", fontSize: 10, color: colors.textFaint },
  monthLabelActive: { color: colors.primary, fontWeight: "700" },
  detail: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    gap: 2,
  },
  detailTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.text, marginBottom: 2 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  detailLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  detailValue: { fontSize: fontSize.sm, color: colors.text },
  detailValueStrong: { fontWeight: "700" },
  detailMuted: { fontSize: fontSize.sm, color: colors.textMuted },
  hint: { fontSize: fontSize.xs, color: colors.textFaint, textAlign: "center", marginTop: spacing.xs },
  empty: { textAlign: "center", color: colors.textFaint, fontSize: fontSize.sm, paddingVertical: spacing.xxl },
});
