import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { ErrorState, Screen } from "@/components/ui/Screen";
import { useInfiniteList } from "@/hooks/useInfiniteList";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { spacing } from "@/lib/theme";
import type { CostCheck } from "@/types";

export default function CostChecksScreen() {
  const { can } = useCan();
  const router = useRouter();
  const list = useInfiniteList<CostCheck>(["cost-checks"], "/cost-checks", {}, { enabled: can("COST_CHECKS") });
  return <>
    <Stack.Screen options={{ title: "Phiếu Check Cost" }} />
    <Screen scroll={false}>
      {!can("COST_CHECKS") ? <ErrorState message="Bạn không có quyền xem phiếu Check Cost." /> : <>
        {can("COST_CHECKS", "ADD") && <View style={{ padding: spacing.lg }}>
          <Button title="Tạo phiếu" onPress={() => router.push("/cost-checks/new")} />
        </View>}
        {list.error && <ErrorState message={list.error.message} />}
        <DataList data={list.items} keyExtractor={(r) => r.id}
          isLoading={list.isLoading} isRefetching={list.isRefetching}
          onRefresh={() => list.refetch()} onEndReached={list.loadMore} isFetchingMore={list.isFetchingNextPage}
          renderItem={(r) => <ListRowCard title={r.code} subtitle={r.user?.name ?? "—"}
            badge={<Badge tone={r.status === "CANCELLED" ? "red" : "green"}>{r.status === "CANCELLED" ? "Đã huỷ" : "Hiệu lực"}</Badge>}
            onPress={() => router.push(`/cost-checks/${r.id}`)}
            meta={[
              { label: "Từ", value: formatDateTime(r.openingStockCheck.checkedAt) },
              { label: "Đến", value: formatDateTime(r.closingStockCheck.checkedAt) },
              { label: "Người tạo", value: r.createdBy?.name ?? "—" },
            ]} />}
        />
      </>}
    </Screen>
  </>;
}
