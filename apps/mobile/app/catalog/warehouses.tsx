import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import type { Warehouse } from "@/types";

export default function WarehousesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Kho hàng" }} />
      <CatalogScreen<Warehouse>
        title="Kho hàng"
        resource="WAREHOUSES"
        endpoint="/warehouses"
        queryKey="warehouses"
        fields={[
          { name: "code", label: "Mã kho", required: true },
          { name: "name", label: "Tên kho", required: true },
          { name: "address", label: "Địa chỉ" },
        ]}
        renderRow={(item) => ({
          title: item.name,
          subtitle: item.code,
          meta: [{ label: "Địa chỉ", value: item.address ?? "—" }],
        })}
      />
    </>
  );
}
