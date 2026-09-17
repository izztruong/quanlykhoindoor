import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import type { Unit } from "@/types";

export default function UnitsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Đơn vị tính" }} />
      <CatalogScreen<Unit>
        title="Đơn vị tính"
        resource="UNITS"
        endpoint="/units"
        queryKey="units"
        fields={[
          { name: "code", label: "Mã đơn vị", required: true },
          { name: "name", label: "Tên đơn vị", required: true },
        ]}
        renderRow={(item) => ({ title: item.name, subtitle: item.code })}
      />
    </>
  );
}
