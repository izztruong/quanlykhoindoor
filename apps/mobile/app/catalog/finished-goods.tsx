import { Stack, useRouter } from "expo-router";
import { useMemo } from "react";
import { CatalogScreen, type CatalogFieldConfig } from "@/components/catalog/CatalogScreen";
import { useUnits } from "@/hooks/useCatalog";
import { FINISHED_GOOD_CATEGORY_OPTIONS, formatCurrency, labels } from "@/lib/format";
import type { FinishedGoodItem } from "@/types";

export default function FinishedGoodsScreen() {
  const router = useRouter();
  const { data: units = [] } = useUnits();

  const fields = useMemo<CatalogFieldConfig[]>(
    () => [
      { name: "code", label: "Mã", required: true },
      { name: "name", label: "Tên đồ thành phẩm", required: true },
      {
        name: "unitId",
        label: "Đơn vị tính",
        type: "select",
        required: true,
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      { name: "category", label: "Nhóm (Trà / Đồ ăn vặt)", type: "select", options: FINISHED_GOOD_CATEGORY_OPTIONS },
      { name: "sellingPrice", label: "Giá bán", type: "number" },
    ],
    [units],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Đồ thành phẩm" }} />
      <CatalogScreen<FinishedGoodItem>
        title="Đồ thành phẩm"
        resource="FINISHED_GOODS"
        endpoint="/finished-good-items"
        queryKey="finished-good-items"
        fields={fields}
        toFormValues={(item) => ({
          code: item.code,
          name: item.name,
          unitId: item.unitId,
          category: item.category ?? "",
          sellingPrice: item.sellingPrice == null ? "" : String(item.sellingPrice),
        })}
        onRowPress={(item) => router.push(`/catalog/finished-goods/${item.id}/recipe`)}
        renderRow={(item) => ({
          title: item.name,
          subtitle: item.code,
          meta: [
            { label: "Đơn vị", value: item.unit?.name ?? "—" },
            { label: "Nhóm", value: item.category ? labels.finishedGoodCategory(item.category) : "—" },
            { label: "Giá bán", value: item.sellingPrice != null ? formatCurrency(item.sellingPrice) : "—" },
            { label: "Công thức", value: "Chạm để khai báo →" },
          ],
        })}
      />
    </>
  );
}
