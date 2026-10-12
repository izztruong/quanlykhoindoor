import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { InfoRow } from "@/components/ui/InfoRow";
import { Input } from "@/components/ui/Input";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers, useWarehouses } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useCreateStockImport } from "@/hooks/useStockImports";
import { formatCurrency } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";
import type { Product } from "@/types";
import { ProductAdder } from "./ProductAdder";
import { formOptions, typeOptions } from "./stockImport";

interface Row {
  product: Product;
  quantity: string;
  costPrice: string;
  note: string;
}
const number = (value: string) => (value.trim() ? Number(value.replace(",", ".")) : NaN);

/**
 * Tạo phiếu nhập kho. Khác bản cũ (dùng chung với phiếu xuất) ở ba chỗ, đều do server chốt:
 * NCC **bắt buộc**, không có ô Khách hàng, và không có ô Trạng thái — phiếu luôn COMPLETED, vì phiếu
 * nháp sẽ không được Check Cost tính mà chẳng có dấu hiệu gì.
 *
 * Thời gian phải có GIỜ: đó là mốc kỳ Check Cost, ngày trần 00:00 làm hàng nhập cùng ngày với phiếu
 * kiểm đầu kỳ rơi ra ngoài kỳ.
 */
export function StockImportForm() {
  const router = useRouter();
  const { can } = useCan();
  const create = useCreateStockImport();
  const warehouses = useWarehouses();
  const suppliers = useSuppliers();
  const products = useProducts({ activeOnly: true });
  const prices = useProductSupplierPrices();

  const [type, setType] = useState("PURCHASE");
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [form, setForm] = useState("CASH");
  const [transactionAt, setTransactionAt] = useState(() => new Date());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const queries = [warehouses, suppliers, products, prices];
  const lookupError = queries.find((q) => q.error)?.error;
  const loading = queries.some((q) => q.isLoading);
  // Server đòi mọi dòng phải có giá thiết lập cho NCC của phiếu (`assertSupplierPrices`), nên chỉ
  // cho thêm đúng những hàng hoá đó thay vì để lưu xong mới báo lỗi.
  const allowedProducts = (products.data ?? []).filter(
    (p) => !supplierId || prices.data?.some((price) => price.productId === p.id && price.supplierId === supplierId),
  );
  const total = rows.reduce((sum, row) => sum + (number(row.quantity) || 0) * (number(row.costPrice) || 0), 0);

  function patch(index: number, values: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...values } : r)));
  }

  function add(product: Product) {
    const price = prices.data?.find((p) => p.productId === product.id && p.supplierId === supplierId);
    setRows((prev) =>
      prev.some((r) => r.product.id === product.id)
        ? prev
        : [...prev, { product, quantity: "1", costPrice: String(price ? price.importPrice : product.costPrice), note: "" }],
    );
    setSearch("");
  }

  function changeSupplier(next: string) {
    setSupplierId(next);
    // Giữ dòng đang nhập để người dùng xem/sửa, chỉ nạp lại giá theo NCC mới.
    setRows((prev) =>
      prev.map((row) => {
        const price = prices.data?.find((p) => p.productId === row.product.id && p.supplierId === next);
        return { ...row, costPrice: String(price ? price.importPrice : row.product.costPrice) };
      }),
    );
  }

  function submit() {
    if (create.isPending || !can("STOCK_IMPORTS", "ADD")) return;
    setError("");
    if (!warehouseId) return setError("Vui lòng chọn kho hàng.");
    if (!supplierId) return setError("Vui lòng chọn nhà cung cấp.");
    if (!rows.length) return setError("Cần ít nhất 1 hàng hoá.");
    for (const row of rows) {
      if (!Number.isFinite(number(row.quantity)) || number(row.quantity) <= 0)
        return setError(`${row.product.name}: số lượng phải lớn hơn 0.`);
      if (!Number.isFinite(number(row.costPrice)) || number(row.costPrice) < 0)
        return setError(`${row.product.name}: giá vốn phải là số không âm.`);
      if (!prices.data?.some((p) => p.productId === row.product.id && p.supplierId === supplierId))
        return setError(`${row.product.name}: chưa được thiết lập giá cho nhà cung cấp đã chọn.`);
    }
    create.mutate(
      {
        type,
        warehouseId,
        supplierId,
        form,
        transactionAt: transactionAt.toISOString(),
        note: note || undefined,
        items: rows.map((r) => ({
          productId: r.product.id,
          quantity: number(r.quantity),
          costPrice: number(r.costPrice),
          note: r.note || undefined,
        })),
      },
      { onSuccess: (created) => router.replace(`/stock/imports/${created.id}`) },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Tạo phiếu nhập kho" }} />
      {!can("STOCK_IMPORTS", "ADD") ? (
        <ErrorState message="Bạn không có quyền tạo phiếu này." />
      ) : loading ? (
        <LoadingState />
      ) : (
        <Screen>
          {lookupError && (
            <>
              <ErrorState message={lookupError.message} />
              <Button title="Tải lại danh mục" onPress={() => queries.forEach((q) => q.refetch())} />
            </>
          )}
          <Card>
            <CardBody style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
              <Select label="Loại phiếu" value={type} options={typeOptions} onChange={setType} />
              <Select
                label="Kho hàng"
                required
                value={warehouseId}
                options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name, sublabel: w.shopUser?.name }))}
                onChange={setWarehouseId}
              />
              <DateTimeField label="Thời gian" value={transactionAt} onChange={setTransactionAt} />
              <Select
                label="Nhà cung cấp"
                required
                value={supplierId}
                options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                onChange={changeSupplier}
              />
              <Select label="Hình thức" value={form} options={formOptions} onChange={setForm} />
              <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
            </CardBody>
          </Card>
          {!!supplierId && <Text style={{ color: colors.textMuted }}>Chỉ thêm được hàng hoá đã có giá cho nhà cung cấp này.</Text>}
          <ProductAdder
            products={allowedProducts}
            selectedIds={new Set(rows.map((r) => r.product.id))}
            search={search}
            onSearch={setSearch}
            onAdd={add}
          />
          {rows.map((row, i) => {
            const missing = supplierId && !prices.data?.some((p) => p.productId === row.product.id && p.supplierId === supplierId);
            return (
              <Card key={row.product.id}>
                <CardBody style={{ paddingTop: spacing.lg, gap: spacing.md }}>
                  <CardTitle>{row.product.name}</CardTitle>
                  <Text style={{ color: colors.textMuted }}>
                    {row.product.code} · {row.product.unit.name}
                  </Text>
                  {!!missing && (
                    <Text style={{ color: colors.danger }}>
                      Hàng hoá chưa có giá cho nhà cung cấp đã chọn. Hãy đổi nhà cung cấp hoặc bỏ dòng này.
                    </Text>
                  )}
                  <View style={{ flexDirection: "row", gap: spacing.md }}>
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Số lượng"
                      required
                      keyboardType="decimal-pad"
                      value={row.quantity}
                      onChangeText={(quantity) => patch(i, { quantity })}
                    />
                    <Input
                      containerStyle={{ flex: 1 }}
                      label="Giá vốn"
                      required
                      keyboardType="decimal-pad"
                      value={row.costPrice}
                      onChangeText={(costPrice) => patch(i, { costPrice })}
                    />
                  </View>
                  <Input label="Ghi chú hàng hoá" value={row.note} onChangeText={(note) => patch(i, { note })} />
                  <InfoRow label="Tiền vốn" value={formatCurrency((number(row.quantity) || 0) * (number(row.costPrice) || 0))} />
                  <Button title="Bỏ dòng" variant="ghost" size="sm" onPress={() => setRows((prev) => prev.filter((_, j) => j !== i))} />
                </CardBody>
              </Card>
            );
          })}
          <InfoRow label="Tổng tiền vốn" value={formatCurrency(total)} />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button title="Lưu phiếu" loading={create.isPending} disabled={!!lookupError} onPress={submit} fullWidth />
        </Screen>
      )}
    </>
  );
}
