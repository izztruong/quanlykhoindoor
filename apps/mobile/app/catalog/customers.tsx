import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import type { Customer } from "@/types";

export default function CustomersScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Khách hàng" }} />
      <CatalogScreen<Customer>
        title="Khách hàng"
        resource="CUSTOMERS"
        endpoint="/customers"
        queryKey="customers"
        fields={[
          { name: "code", label: "Mã khách hàng", required: true },
          { name: "name", label: "Tên khách hàng", required: true },
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
