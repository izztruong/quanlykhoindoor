import { Stack, useLocalSearchParams } from "expo-router";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { InfoRow } from "@/components/ui/InfoRow";
import { LoadingState, ErrorState, Screen } from "@/components/ui/Screen";
import { formatCurrency, formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";
import { stockConfig, stockTotal, type StockVariant } from "./stockConfig";

export function StockTransactionDetail({ variant }: { variant: StockVariant }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const config = stockConfig[variant];
  const { can } = useCan();
  const query = config.hooks.useDetail(can(config.resource) ? id ?? "" : "");
  const row = query.data;
  return <>
    <Stack.Screen options={{ title: row?.code ?? config.title }} />
    {!can(config.resource) ? <ErrorState message="Bạn không có quyền xem phiếu này." /> : query.isLoading ? <LoadingState /> : !row ?
      <ErrorState message={query.error?.message ?? "Không tìm thấy phiếu."} /> :
      <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
        <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
          <CardTitle>{row.code}</CardTitle>
          <InfoRow label="Loại" value={config.typeLabel(row.type)} />
          <InfoRow label="Thời gian" value={formatDateVN(row.transactionAt)} />
          <InfoRow label="Kho" value={row.warehouse.name} />
          <InfoRow label="Hình thức" value={labels.transactionForm(row.form)} />
          <InfoRow label="Trạng thái" value={labels.transactionStatus(row.status)} />
          <InfoRow label="Nhà cung cấp" value={row.supplier?.name ?? "—"} />
          <InfoRow label="Khách hàng" value={row.customer?.name ?? "—"} />
          <InfoRow label="Ghi chú" value={row.note || "—"} />
          <InfoRow label="Tổng tiền vốn" value={formatCurrency(stockTotal(row))} />
        </CardBody></Card>
        {row.items.map((item) => <Card key={item.id}><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
          <CardTitle>{item.product.name}</CardTitle>
          <InfoRow label="Mã · ĐVT" value={`${item.product.code} · ${item.product.unit.name}`} />
          <InfoRow label="Số lượng" value={formatNumber(item.quantity)} />
          <InfoRow label="Giá vốn" value={formatCurrency(item.costPrice)} />
          <InfoRow label="Tiền vốn" value={formatCurrency(item.costAmount)} />
          {variant === "export" && <InfoRow label="Nhà cung cấp" value={item.supplier?.name ?? "—"} />}
          <InfoRow label="Ghi chú" value={item.note || "—"} />
        </CardBody></Card>)}
      </Screen>}
  </>;
}
