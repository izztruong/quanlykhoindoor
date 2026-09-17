import { Stack } from "expo-router";
import { StockCheckForm } from "@/components/stockChecks/StockCheckForm";

export default function NewStockCheckScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Tạo phiếu kiểm kê" }} />
      <StockCheckForm />
    </>
  );
}
