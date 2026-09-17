import { Stack } from "expo-router";
import { MaterialWasteForm } from "@/components/materialWaste/MaterialWasteForm";

export default function NewMaterialWasteScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Tạo phiếu huỷ" }} />
      <MaterialWasteForm />
    </>
  );
}
