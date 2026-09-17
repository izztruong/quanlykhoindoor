import { Stack, useLocalSearchParams } from "expo-router";
import { MaterialWasteForm } from "@/components/materialWaste/MaterialWasteForm";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useMaterialWaste } from "@/hooks/useMaterialWaste";

export default function EditMaterialWasteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const waste = useMaterialWaste(id ?? "");

  return (
    <>
      <Stack.Screen options={{ title: "Sửa phiếu huỷ" }} />
      {waste.isLoading ? (
        <LoadingState />
      ) : waste.data ? (
        <MaterialWasteForm existing={waste.data} />
      ) : (
        <ErrorState message="Không tìm thấy phiếu huỷ" />
      )}
    </>
  );
}
