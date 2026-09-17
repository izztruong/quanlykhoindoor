import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import type { ProductGroup } from "@/types";

export default function ProductGroupsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Nhóm hàng hoá" }} />
      <CatalogScreen<ProductGroup>
        title="Nhóm hàng hoá"
        resource="PRODUCT_GROUPS"
        endpoint="/product-groups"
        queryKey="product-groups"
        fields={[
          { name: "code", label: "Mã nhóm", required: true },
          { name: "name", label: "Tên nhóm", required: true },
        ]}
        renderRow={(item) => ({ title: item.name, subtitle: item.code })}
      />
    </>
  );
}
