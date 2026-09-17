import { Stack, useLocalSearchParams } from "expo-router";
import { MaterialTransferForm } from "@/components/materialTransfers/MaterialTransferForm";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { useCan } from "@/lib/permissions";

export default function EditTransferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useCan();
  const allowed = can("MATERIAL_TRANSFERS", "EDIT");
  const query = useMaterialTransfer(allowed ? id ?? "" : "");
  return <><Stack.Screen options={{ title: "Sửa phiếu điều chuyển" }} />
    {!allowed ? <ErrorState message="Bạn không có quyền sửa phiếu này." /> : query.isLoading ? <LoadingState /> : query.data ?
      <MaterialTransferForm key={query.data.id} existing={query.data} /> : <ErrorState message={query.error?.message ?? "Không tìm thấy phiếu."} />}
  </>;
}
