import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { ProductAdder } from "@/components/stock/ProductAdder";
import { useProducts } from "@/hooks/useCatalog";
import { useUserOptions } from "@/hooks/useUsers";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useCreateMaterialTransfer, useUpdateMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { useCan } from "@/lib/permissions";
import { looseQuantityForEditing } from "@/lib/materialTransfer";
import { colors, spacing } from "@/lib/theme";
import type { MaterialTransfer, Product } from "@/types";

interface Row { product: Product; wholeQuantity: string; looseQuantity: string; supplierId: string; supplierName?: string; costPrice: string; note: string }
const optionalNumber = (value: string) => value.trim() ? Number(value.replace(",", ".")) : undefined;

export function MaterialTransferForm({ existing }: { existing?: MaterialTransfer }) {
  const { can } = useCan();
  const router = useRouter();
  const create = useCreateMaterialTransfer();
  const update = useUpdateMaterialTransfer(existing?.id ?? "");
  const users = useUserOptions();
  const products = useProducts({ activeOnly: true });
  const prices = useProductSupplierPrices();
  const [fromUserId, setFromUserId] = useState(existing?.fromUserId ?? "");
  const [toUserId, setToUserId] = useState(existing?.toUserId ?? "");
  const [transferAt, setTransferAt] = useState(() => existing ? new Date(existing.transferAt) : new Date());
  const [note, setNote] = useState(existing?.note ?? "");
  const [rows, setRows] = useState<Row[]>(() => (existing?.items ?? []).map((item) => ({
    product: item.product, wholeQuantity: item.wholeQuantity == null ? "" : String(Number(item.wholeQuantity)),
    // API lưu lượng đã trừ vỏ; đổi về cân cả vỏ để PUT không trừ thêm lần nữa khi chỉ sửa ghi chú.
    looseQuantity: looseQuantityForEditing(item.looseQuantity, item.product.tareWeight),
    supplierId: item.supplierId ?? "", supplierName: item.supplier?.name,
    costPrice: item.costPrice == null ? "" : String(Number(item.costPrice)), note: item.note ?? "",
  })));
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = create.isPending || update.isPending || saved;
  const allowed = can("MATERIAL_TRANSFERS", existing ? "EDIT" : "ADD");
  const queries = [users, products, prices];
  const lookupError = queries.find((q) => q.error)?.error;
  const shopOptions = (users.data ?? []).map((u) => ({ value: u.id, label: u.name }));
  // Giữ tên quán của phiếu cũ dù tài khoản vừa chuyển sang vai trò không phải quán.
  for (const shop of [existing?.fromUser, existing?.toUser]) {
    if (shop && !shopOptions.some((u) => u.value === shop.id)) shopOptions.push({ value: shop.id, label: shop.name });
  }
  function patch(index: number, values: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...values } : r));
  }
  function add(product: Product) {
    setRows((prev) => prev.some((r) => r.product.id === product.id) ? prev : [...prev, {
      product, wholeQuantity: "", looseQuantity: "", supplierId: "", costPrice: "", note: "",
    }]);
    setSearch("");
  }
  function submit() {
    if (!allowed || pending) return;
    setError("");
    if (!fromUserId || !toUserId) return setError("Vui lòng chọn quán gửi và quán nhận.");
    if (fromUserId === toUserId) return setError("Quán gửi và quán nhận phải khác nhau.");
    if (!rows.length) return setError("Vui lòng thêm ít nhất 1 dòng nguyên liệu.");
    for (const row of rows) {
      const whole = optionalNumber(row.wholeQuantity), loose = optionalNumber(row.looseQuantity), cost = optionalNumber(row.costPrice);
      if (whole == null && loose == null) return setError(`${row.product.name}: nhập ít nhất một số lượng chẵn hoặc lẻ.`);
      if ([whole, loose, cost].some((n) => n != null && (!Number.isFinite(n) || n < 0)))
        return setError(`${row.product.name}: số lượng và giá vốn phải là số không âm.`);
    }
    const payload = { fromUserId, toUserId, transferAt: transferAt.toISOString(), note: note || undefined,
      items: rows.map((r) => ({ productId: r.product.id, wholeQuantity: optionalNumber(r.wholeQuantity), looseQuantity: optionalNumber(r.looseQuantity),
        supplierId: r.supplierId || undefined, costPrice: optionalNumber(r.costPrice), note: r.note || undefined })),
    };
    if (existing) update.mutate(payload, { onSuccess: (updated) => {
      setSaved(true);
      const done = () => router.replace(`/material-transfers/${updated.id}`);
      if (updated.affectedCostChecks.length) {
        Alert.alert("Đã lưu phiếu", `Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${updated.affectedCostChecks.map((c) => c.code).join(", ")}`,
          [{ text: "Đã hiểu", onPress: done }], { cancelable: false });
      } else done();
    } });
    else create.mutate(payload, { onSuccess: (created) => { setSaved(true); router.replace(`/material-transfers/${created.id}`); } });
  }

  return <>
    <Stack.Screen options={{ title: existing ? `Sửa ${existing.code}` : "Tạo phiếu điều chuyển" }} />
    {!allowed ? <ErrorState message="Bạn không có quyền thao tác phiếu này." /> : queries.some((q) => q.isLoading) ? <LoadingState /> :
      <Screen>
        {lookupError && <><ErrorState message={lookupError.message} /><Button title="Tải lại danh mục" onPress={() => queries.forEach((q) => q.refetch())} /></>}
        <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
          <Select label="Quán gửi" required value={fromUserId} options={shopOptions} onChange={setFromUserId} />
          <Select label="Quán nhận" required value={toUserId} options={shopOptions} onChange={setToUserId} />
          <DateTimeField label="Thời gian điều chuyển" value={transferAt} onChange={setTransferAt} />
          <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
        </CardBody></Card>
        <Text style={{ color: colors.textMuted }}>Cân cả vỏ: nhập SL lẻ gồm vỏ, hệ thống tự trừ vỏ khi lưu. NCC và giá vốn không bắt buộc.</Text>
        <ProductAdder products={products.data ?? []} selectedIds={new Set(rows.map((r) => r.product.id))} search={search} onSearch={setSearch} onAdd={add} />
        {rows.map((row, i) => {
          const options = (prices.data ?? []).filter((p) => p.productId === row.product.id).map((p) => ({ value: p.supplierId, label: p.supplier.name }));
          if (row.supplierId && !options.some((s) => s.value === row.supplierId)) options.push({ value: row.supplierId, label: row.supplierName ?? "NCC trên phiếu" });
          return <Card key={row.product.id}><CardBody style={{ paddingTop: spacing.lg, gap: spacing.md }}>
            <CardTitle>{row.product.name}</CardTitle>
            <Text style={{ color: colors.textMuted }}>{row.product.code} · {row.product.unit.name}</Text>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label={`SL chẵn (${row.product.unit.name})`} keyboardType="decimal-pad" value={row.wholeQuantity} onChangeText={(wholeQuantity) => patch(i, { wholeQuantity })} />
              <Input containerStyle={{ flex: 1 }} label={`SL lẻ${row.product.recipeUnit ? ` (${row.product.recipeUnit.name})` : ""}`} keyboardType="decimal-pad" value={row.looseQuantity} onChangeText={(looseQuantity) => patch(i, { looseQuantity })} />
            </View>
            <Select label="Nhà cung cấp" emptyLabel="Không chọn" value={row.supplierId} options={options} onChange={(supplierId) => {
              const price = prices.data?.find((p) => p.productId === row.product.id && p.supplierId === supplierId);
              patch(i, { supplierId, supplierName: price?.supplier.name, costPrice: price ? String(price.exportPrice) : "" });
            }} />
            <Input label="Giá vốn" keyboardType="decimal-pad" value={row.costPrice} onChangeText={(costPrice) => patch(i, { costPrice })} />
            <Input label="Ghi chú hàng hoá" value={row.note} onChangeText={(note) => patch(i, { note })} />
            <Button title="Bỏ dòng" variant="ghost" size="sm" onPress={() => setRows((prev) => prev.filter((_, j) => j !== i))} />
          </CardBody></Card>;
        })}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button title={existing ? "Lưu thay đổi" : "Tạo phiếu điều chuyển"} loading={pending} disabled={!!lookupError} onPress={submit} fullWidth />
      </Screen>}
  </>;
}
