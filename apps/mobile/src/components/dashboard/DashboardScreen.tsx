import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/layout/AppHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useCostSummary, useUnconfirmedOrders, useWasteSummary } from "@/hooks/useDashboard";
import { useUserOptions } from "@/hooks/useUsers";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { DashboardCostMonth } from "@/types";
import { MaterialCostChart } from "./MaterialCostChart";
import { QuickActions } from "./QuickActions";
import { StatCard, StatItem, StatRow } from "./StatCard";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * So chi phí tháng này với một tháng khác. Chi phí TĂNG là xấu nên tăng = đỏ, giảm = xanh.
 * Không có phiếu ở một trong hai tháng thì không so được — hiện "—" thay vì một con số vô nghĩa.
 */
function CostDelta({
  current,
  reference,
  label,
}: {
  current: DashboardCostMonth;
  reference: DashboardCostMonth;
  label: string;
}) {
  const comparable = current.checkCount > 0 && reference.checkCount > 0 && reference.cost > 0;
  const change = comparable ? (current.cost - reference.cost) / reference.cost : 0;
  const up = change > 0;

  return (
    <View style={styles.delta}>
      {comparable ? (
        <View style={styles.deltaValue}>
          <Ionicons name={up ? "trending-up" : "trending-down"} size={16} color={up ? colors.danger : colors.success} />
          <Text style={[styles.deltaText, { color: up ? colors.danger : colors.success }]}>
            {formatPercent(Math.abs(change))}
          </Text>
        </View>
      ) : (
        <Text style={styles.deltaEmpty}>—</Text>
      )}
      <Text style={styles.deltaLabel}>{label}</Text>
    </View>
  );
}

export function DashboardScreen() {
  const { user, can, scopeAll } = useCan();
  const currentYear = new Date().getFullYear();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [year, setYear] = useState(currentYear);

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  // Phạm vi SELF không có ô chọn: đơn và phiếu huỷ server tự ép về chính mình, còn Check Cost không
  // áp phạm vi nên phải truyền id của mình để không cộng lẫn số của quán khác.
  const userId = scopeAll ? selectedUserId : (user?.id ?? "");

  const canOrders = can("ORDERS");
  const canWaste = can("MATERIAL_WASTE");
  const canCost = can("COST_CHECKS");

  const orders = useUnconfirmedOrders(userId, canOrders);
  const waste = useWasteSummary(userId, canWaste);
  const cost = useCostSummary(userId, year, canCost && !!user);

  const nothingToShow = !canOrders && !canWaste && !canCost;

  function refetchAll() {
    if (canOrders) orders.refetch();
    if (canWaste) waste.refetch();
    if (canCost) cost.refetch();
  }

  const refreshing = orders.isFetching || waste.isFetching || cost.isFetching;

  return (
    <View style={styles.root}>
      <AppHeader />
      <Screen withTabBar refreshing={refreshing} onRefresh={refetchAll}>
        {scopeAll && !nothingToShow ? (
          <Select
            label="Quán"
            value={selectedUserId}
            onChange={setSelectedUserId}
            emptyLabel="Tất cả quán"
            options={users.map((u) => ({ value: u.id, label: u.name, sublabel: u.email }))}
          />
        ) : null}

        <QuickActions />

        {nothingToShow ? (
          <Card>
            <CardBody>
              <Text style={styles.noPermission}>Tài khoản chưa được cấp quyền xem mục nào trên trang chủ.</Text>
            </CardBody>
          </Card>
        ) : null}

        {canOrders ? (
          <StatCard title="Đơn hàng chưa xác nhận" href="/orders" isLoading={orders.isLoading}>
            <Text style={styles.bigValue}>{formatNumber(orders.data ?? 0)} đơn</Text>
          </StatCard>
        ) : null}

        {canWaste ? (
          <StatCard title="Huỷ hàng" href="/material-waste" isLoading={waste.isLoading}>
            {waste.data ? (
              <>
                <Text style={styles.bigValue}>{formatCurrency(Math.round(waste.data.value))}</Text>
                <Text style={styles.caption}>Giá trị huỷ hàng (theo giá vốn hiện tại)</Text>
                <StatRow>
                  <StatItem
                    value={formatNumber(waste.data.slipCount)}
                    label={`Phiếu huỷ (${waste.data.days} ngày qua)`}
                  />
                  <StatItem value={formatNumber(waste.data.itemCount)} label="Hàng hoá bị huỷ" />
                </StatRow>
              </>
            ) : null}
          </StatCard>
        ) : null}

        {canCost ? (
          <>
            <StatCard
              title={
                cost.data
                  ? `Chi phí nguyên vật liệu ${pad2(cost.data.current.month)}/${cost.data.current.year}`
                  : "Chi phí nguyên vật liệu"
              }
              isLoading={cost.isLoading}
            >
              {cost.data ? (
                <>
                  <Text style={styles.bigValue}>{formatCurrency(Math.round(cost.data.current.cost))}</Text>
                  <Text style={styles.caption}>
                    {cost.data.current.checkCount > 0
                      ? `(${formatPercent(cost.data.current.pct)} doanh thu)`
                      : "Chưa có phiếu Check Cost chốt kỳ trong tháng"}
                  </Text>
                  <StatRow>
                    <CostDelta current={cost.data.current} reference={cost.data.previousMonth} label="so với tháng trước" />
                    <CostDelta
                      current={cost.data.current}
                      reference={cost.data.sameMonthLastYear}
                      label="so với cùng tháng năm trước"
                    />
                  </StatRow>
                </>
              ) : null}
            </StatCard>

            <Card>
              <CardHeader>
                <CardTitle>Tỷ lệ chi phí NVL</CardTitle>
              </CardHeader>
              <CardBody>
                <Text style={styles.caption}>
                  Chi phí NVL / doanh thu thuần, mỗi phiếu Check Cost tính vào tháng của ngày chốt kỳ
                </Text>
                <Select
                  value={String(year)}
                  onChange={(value) => setYear(Number(value))}
                  searchable={false}
                  style={styles.yearSelect}
                  options={Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => ({
                    value: String(y),
                    label: `Năm ${y}`,
                  }))}
                />
                {cost.isLoading || !cost.data ? (
                  <Text style={styles.caption}>Đang tải...</Text>
                ) : (
                  <MaterialCostChart months={cost.data.months} />
                )}
              </CardBody>
            </Card>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bigValue: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  caption: { fontSize: fontSize.sm, color: colors.textMuted },
  noPermission: { fontSize: fontSize.sm, color: colors.textMuted },
  yearSelect: { marginVertical: spacing.md },
  delta: { flex: 1, gap: 2 },
  deltaValue: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  deltaText: { fontSize: fontSize.lg, fontWeight: "700" },
  deltaEmpty: { fontSize: fontSize.lg, fontWeight: "700", color: colors.textFaint },
  deltaLabel: { fontSize: fontSize.xs, color: colors.textMuted },
});
