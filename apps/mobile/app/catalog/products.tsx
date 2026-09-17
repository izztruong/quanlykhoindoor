import { Stack } from "expo-router";
import { useMemo } from "react";
import { Badge } from "@/components/ui/Badge";
import { CatalogScreen, type CatalogFieldConfig } from "@/components/catalog/CatalogScreen";
import { useProductGroups, useUnits } from "@/hooks/useCatalog";
import { PRODUCT_TYPE_OPTIONS, formatCurrency, labels } from "@/lib/format";
import type { Product } from "@/types";

export default function ProductsScreen() {
  const { data: units = [] } = useUnits();
  const { data: productGroups = [] } = useProductGroups();

  const fields = useMemo<CatalogFieldConfig[]>(
    () => [
      { name: "code", label: "Mã hàng hoá", required: true },
      { name: "name", label: "Tên hàng hoá", required: true },
      {
        name: "unitId",
        label: "Đơn vị tính",
        type: "select",
        required: true,
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      {
        name: "productGroupId",
        label: "Nhóm hàng hoá",
        type: "select",
        required: true,
        options: productGroups.map((g) => ({ value: g.id, label: g.name })),
      },
      { name: "costPrice", label: "Giá vốn", type: "number", required: true },
      { name: "type", label: "Loại hàng hoá", type: "select", required: true, options: PRODUCT_TYPE_OPTIONS },
      { name: "note", label: "Ghi chú" },
      {
        name: "recipeUnitId",
        label: "Đơn vị công thức (vd Gram)",
        type: "select",
        options: units.map((u) => ({ value: u.id, label: u.name })),
      },
      { name: "recipeUnitsPerBaseUnit", label: "Quy đổi: 1 đơn vị chính = ? đơn vị công thức", type: "number" },
      {
        name: "tareWeight",
        label: "Khối lượng vỏ (theo đơn vị công thức — SL lẻ nhập cả vỏ sẽ tự trừ số này)",
        type: "number",
      },
      {
        name: "active",
        label: "Đang sử dụng",
        type: "checkbox",
      },
    ],
    [units, productGroups],
  );

  const filters = useMemo(
    () => [
      {
        name: "productGroupId",
        label: "Nhóm hàng hoá",
        options: productGroups.map((g) => ({ value: g.id, label: g.name })),
      },
      { name: "type", label: "Loại hàng hoá", options: PRODUCT_TYPE_OPTIONS },
      {
        name: "active",
        label: "Trạng thái",
        options: [
          { value: "true", label: "Đang dùng" },
          { value: "false", label: "Ngừng dùng" },
        ],
      },
    ],
    [productGroups],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Hàng hoá" }} />
      <CatalogScreen<Product>
        title="Hàng hoá"
        resource="PRODUCTS"
        endpoint="/products"
        queryKey="products"
        fields={fields}
        filters={filters}
        // Ô chọn trong form lưu theo id, còn bản ghi trả về là object lồng — phải kéo id ra, nếu
        // không mở sửa sẽ thấy ô Đơn vị/Nhóm trống rồi lưu đè mất.
        toFormValues={(item) => ({
          code: item.code,
          name: item.name,
          unitId: item.unitId,
          productGroupId: item.productGroupId,
          costPrice: String(item.costPrice ?? ""),
          type: item.type ?? "",
          note: item.note ?? "",
          recipeUnitId: item.recipeUnitId ?? "",
          recipeUnitsPerBaseUnit: item.recipeUnitsPerBaseUnit == null ? "" : String(item.recipeUnitsPerBaseUnit),
          tareWeight: item.tareWeight == null ? "" : String(item.tareWeight),
          active: item.active === false ? "false" : "true",
        })}
        renderRow={(item) => ({
          title: item.name,
          subtitle: item.code,
          badge:
            item.active === false ? <Badge tone="gray">Ngừng dùng</Badge> : <Badge tone="green">Đang dùng</Badge>,
          meta: [
            { label: "Đơn vị", value: item.unit?.name ?? "—" },
            { label: "Nhóm", value: item.productGroup?.name ?? "—" },
            { label: "Loại", value: labels.productType(item.type) },
            { label: "Giá vốn", value: formatCurrency(item.costPrice) },
          ],
        })}
      />
    </>
  );
}
