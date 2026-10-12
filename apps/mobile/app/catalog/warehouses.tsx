import { Stack } from "expo-router";
import { CatalogScreen } from "@/components/catalog/CatalogScreen";
import { useUserOptions } from "@/hooks/useUsers";
import type { Warehouse } from "@/types";

export default function WarehousesScreen() {
  // Mặc định scope "shop" — server chỉ trả tài khoản thuộc vai trò có tick "Là quán", đúng tập mà
  // kho được phép gán cho.
  const { data: shops = [] } = useUserOptions();

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
          // Mỗi quán một kho: Check Cost lấy hàng nhập trong kỳ từ phiếu nhập của kho quán, nên quán
          // nào cũng cần có kho. clearable: để trống phải gửi null, nếu không thì không gỡ được quán.
          { name: "shopUserId", label: "Quán", type: "select", clearable: true, options: shops.map((s) => ({ value: s.id, label: s.name })) },
          { name: "address", label: "Địa chỉ" },
        ]}
        renderRow={(item) => ({
          title: item.name,
          subtitle: item.code,
          meta: [
            { label: "Quán", value: item.shopUser?.name ?? "—" },
            { label: "Địa chỉ", value: item.address ?? "—" },
          ],
        })}
      />
    </>
  );
}
