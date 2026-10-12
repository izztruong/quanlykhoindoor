import { Stack, useLocalSearchParams } from "expo-router";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { InfoRow } from "@/components/ui/InfoRow";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useStockImport } from "@/hooks/useStockImports";
import { formatCurrency, formatDateVN, formatNumber, labels } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";
import { shopLabel, stockImportTotal } from "./stockImport";

/**
 * Chi tiết chỉ đọc. Không có Trạng thái (phiếu luôn COMPLETED) và không có Khách hàng (phiếu nhập
 * không bán cho ai) — giống bản web. Sửa phiếu và ảnh chứng từ hiện chỉ có trên web.
 */
export function StockImportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useCan();
  const query = useStockImport(can("STOCK_IMPORTS") ? (id ?? "") : "");
  const row = query.data;

  return (
    <>
      <Stack.Screen options={{ title: row?.code ?? "Phiếu nhập kho" }} />
      {!can("STOCK_IMPORTS") ? (
        <ErrorState message="Bạn không có quyền xem phiếu này." />
      ) : query.isLoading ? (
        <LoadingState />
      ) : !row ? (
        <ErrorState message={query.error?.message ?? "Không tìm thấy phiếu."} />
      ) : (
        <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
          <Card>
            <CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
              <CardTitle>{row.code}</CardTitle>
              <InfoRow label="Loại" value={labels.stockImportType(row.type)} />
              <InfoRow label="Thời gian" value={formatDateVN(row.transactionAt)} />
              <InfoRow label="Kho" value={row.warehouse.name} />
              <InfoRow label="Quán" value={shopLabel(row.warehouse)} />
              <InfoRow label="Nhà cung cấp" value={row.supplier?.name ?? "—"} />
              <InfoRow label="Hình thức" value={labels.transactionForm(row.form)} />
              <InfoRow label="Ghi chú" value={row.note || "—"} />
              <InfoRow label="Tổng tiền vốn" value={formatCurrency(stockImportTotal(row))} />
            </CardBody>
          </Card>
          {row.items.map((item) => (
            <Card key={item.id}>
              <CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
                <CardTitle>{item.product.name}</CardTitle>
                <InfoRow label="Mã · ĐVT" value={`${item.product.code} · ${item.product.unit.name}`} />
                <InfoRow label="Số lượng" value={formatNumber(item.quantity)} />
                <InfoRow label="Giá vốn" value={formatCurrency(item.costPrice)} />
                <InfoRow label="Tiền vốn" value={formatCurrency(item.costAmount)} />
                <InfoRow label="Ghi chú" value={item.note || "—"} />
              </CardBody>
            </Card>
          ))}
        </Screen>
      )}
    </>
  );
}
