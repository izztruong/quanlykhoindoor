import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { InfoRow } from "@/components/ui/InfoRow";
import { Button } from "@/components/ui/Button";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { useMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { useCan } from "@/lib/permissions";
import { formatDateVN, formatNumber, formatCurrency } from "@/lib/format";
import { spacing } from "@/lib/theme";

export default function TransferDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { can } = useCan();
  const query = useMaterialTransfer(can("MATERIAL_TRANSFERS") ? id ?? "" : "");
  const r = query.data;
  return <><Stack.Screen options={{ title: r?.code ?? "Phiếu điều chuyển" }} />
    {!can("MATERIAL_TRANSFERS") ? <ErrorState message="Bạn không có quyền xem phiếu này." /> : query.isLoading ? <LoadingState /> : !r ?
      <ErrorState message={query.error?.message ?? "Không tìm thấy phiếu."} /> :
      <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
        <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
          <InfoRow label="Mã" value={r.code} />
          <InfoRow label="Quán gửi" value={r.fromUser.name} />
          <InfoRow label="Quán nhận" value={r.toUser.name} />
          <InfoRow label="Thời gian" value={formatDateVN(r.transferAt)} />
          <InfoRow label="Người tạo" value={r.createdBy?.name ?? "—"} />
          <InfoRow label="Ghi chú" value={r.note || "—"} />
        </CardBody></Card>
        {can("MATERIAL_TRANSFERS", "EDIT") && <Button title="Sửa phiếu" variant="secondary" onPress={() => router.push(`/material-transfers/${r.id}/edit`)} />}
        {(r.items ?? []).map((item) => <Card key={item.id}><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
          <CardTitle>{item.product.name}</CardTitle>
          <InfoRow label="Mã · ĐVT" value={`${item.product.code} · ${item.product.unit.name}`} />
          <InfoRow label="Chẵn" value={item.wholeQuantity == null ? "—" : formatNumber(item.wholeQuantity)} />
          <InfoRow label="Lẻ (đã trừ vỏ)" value={item.looseQuantity == null ? "—" : `${formatNumber(item.looseQuantity)} ${item.product.recipeUnit?.name ?? ""}`} />
          <InfoRow label="Nhà cung cấp" value={item.supplier?.name ?? "—"} />
          <InfoRow label="Giá vốn" value={item.costPrice == null ? "—" : formatCurrency(item.costPrice)} />
          <InfoRow label="Ghi chú" value={item.note || "—"} />
        </CardBody></Card>)}
      </Screen>}
  </>;
}
