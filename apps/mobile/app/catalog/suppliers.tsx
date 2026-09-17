import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import type { Supplier } from "@/types";

export default function SuppliersScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Nhà cung cấp" }} />
      <CatalogScreen<Supplier>
        title="Nhà cung cấp"
        resource="SUPPLIERS"
        endpoint="/suppliers"
        queryKey="suppliers"
        fields={[
          { name: "code", label: "Mã NCC", required: true },
          { name: "name", label: "Tên nhà cung cấp", required: true },
          { name: "phone", label: "Điện thoại" },
          { name: "address", label: "Địa chỉ" },
        ]}
        renderRow={(item) => ({
          title: item.name,
          subtitle: item.code,
          meta: [
            { label: "Điện thoại", value: item.phone ?? "—" },
            { label: "Địa chỉ", value: item.address ?? "—" },
          ],
        })}
      />
    </>
  );
}
