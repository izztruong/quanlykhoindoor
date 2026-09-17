import { Stack, useLocalSearchParams } from "expo-router";
import { StockCheckForm } from "@/components/stockChecks/StockCheckForm";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useStockCheck } from "@/hooks/useStockChecks";

export default function EditStockCheckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const check = useStockCheck(id ?? "");

  return (
    <>
      <Stack.Screen options={{ title: "Sửa phiếu kiểm kê" }} />
      {check.isLoading ? (
        <LoadingState />
      ) : check.data ? (
        <StockCheckForm existing={check.data} />
      ) : (
        <ErrorState message="Không tìm thấy phiếu kiểm" />
      )}
    </>
  );
}
