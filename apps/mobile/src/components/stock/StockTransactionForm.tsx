import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { InfoRow } from "@/components/ui/InfoRow";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useWarehouses, useSuppliers, useCustomers, useProducts } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { formatCurrency } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";
import type { Product } from "@/types";
import { formOptions, statusOptions, stockConfig, type StockVariant } from "./stockConfig";
import { ProductAdder } from "./ProductAdder";

interface Row { product: Product; quantity: string; costPrice: string; supplierId: string; note: string }
const number = (value: string) => value.trim() ? Number(value.replace(",", ".")) : NaN;

export function StockTransactionForm({ variant }: { variant: StockVariant }) {
  const config = stockConfig[variant];
  const router = useRouter();
  const { can } = useCan();
  const create = config.hooks.useCreate();
  const warehouses = useWarehouses();
  const suppliers = useSuppliers();
  const customers = useCustomers();
  const products = useProducts({ activeOnly: true });
  const prices = useProductSupplierPrices();
  const [type, setType] = useState<string>(config.typeOptions[0].value);
  const [warehouseId, setWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [form, setForm] = useState("CASH");
  const [status, setStatus] = useState("COMPLETED");
  const [transactionAt, setTransactionAt] = useState(() => new Date());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const queries = [warehouses, suppliers, customers, products, prices];
  const lookupError = queries.find((q) => q.error)?.error;
  const loading = queries.some((q) => q.isLoading);
  const allowedProducts = (products.data ?? []).filter((p) => variant !== "import" || !supplierId ||
    prices.data?.some((price) => price.productId === p.id && price.supplierId === supplierId));
  const total = rows.reduce((sum, row) => sum + (number(row.quantity) || 0) * (number(row.costPrice) || 0), 0);

  function patch(index: number, values: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...values } : r));
  }
  function add(product: Product) {
    const price = prices.data?.find((p) => p.productId === product.id && p.supplierId === supplierId);
    setRows((prev) => prev.some((r) => r.product.id === product.id) ? prev : [...prev, {
      product, quantity: "1", costPrice: String(variant === "import" && price ? price.importPrice : product.costPrice), supplierId: "", note: "",
    }]);
    setSearch("");
  }
  function changeSupplier(next: string) {
    setSupplierId(next);
    // Giữ dòng đang nhập để người dùng xem/sửa, đánh dấu dòng không có giá khi đổi NCC.
    setRows((prev) => prev.map((row) => {
      const price = prices.data?.find((p) => p.productId === row.product.id && p.supplierId === next);
      return { ...row, costPrice: String(price ? price.importPrice : row.product.costPrice) };
    }));
  }
  function submit() {
    if (create.isPending || !can(config.resource, "ADD")) return;
    setError("");
    if (!warehouseId) return setError("Vui lòng chọn kho hàng.");
    if (!rows.length) return setError("Cần ít nhất 1 hàng hoá.");
    for (const row of rows) {
      if (!Number.isFinite(number(row.quantity)) || number(row.quantity) <= 0) return setError(`${row.product.name}: số lượng phải lớn hơn 0.`);
      if (!Number.isFinite(number(row.costPrice)) || number(row.costPrice) < 0) return setError(`${row.product.name}: giá vốn phải là số không âm.`);
      const chosenSupplier = variant === "import" ? supplierId : row.supplierId;
      if (chosenSupplier && !prices.data?.some((p) => p.productId === row.product.id && p.supplierId === chosenSupplier))
        return setError(`${row.product.name}: chưa được thiết lập giá cho nhà cung cấp đã chọn.`);
    }
    create.mutate({ type, warehouseId, supplierId: variant === "import" ? supplierId || undefined : undefined,
      customerId: customerId || undefined, form, status, transactionAt: transactionAt.toISOString(), note: note || undefined,
      items: rows.map((r) => ({ productId: r.product.id, quantity: number(r.quantity), costPrice: number(r.costPrice),
        supplierId: variant === "export" ? r.supplierId || undefined : undefined, note: r.note || undefined })),
    }, { onSuccess: (created) => router.replace(`${config.base}/${created.id}`) });
  }
  return <>
    <Stack.Screen options={{ title: `Tạo ${config.title.toLowerCase()}` }} />
    {!can(config.resource, "ADD") ? <ErrorState message="Bạn không có quyền tạo phiếu này." /> : loading ? <LoadingState /> :
      <Screen>
        {lookupError && <><ErrorState message={lookupError.message} /><Button title="Tải lại danh mục" onPress={() => queries.forEach((q) => q.refetch())} /></>}
        <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.lg }}>
          <Select label="Loại phiếu" value={type} options={config.typeOptions} onChange={setType} />
          <Select label="Kho hàng" required value={warehouseId} options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))} onChange={setWarehouseId} />
          <DateTimeField label="Thời gian" value={transactionAt} onChange={setTransactionAt} />
          {variant === "import" && <Select label="Nhà cung cấp" value={supplierId} emptyLabel="Không có" options={(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={changeSupplier} />}
          <Select label="Khách hàng" value={customerId} emptyLabel="Không có" options={(customers.data ?? []).map((c) => ({ value: c.id, label: c.name }))} onChange={setCustomerId} />
          <Select label="Hình thức" value={form} options={formOptions} onChange={setForm} />
          <Select label="Trạng thái" value={status} options={statusOptions} onChange={setStatus} />
          <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
        </CardBody></Card>
        {variant === "import" && !!supplierId && <Text style={{ color: colors.textMuted }}>Chỉ thêm được hàng hoá đã có giá cho nhà cung cấp này.</Text>}
        <ProductAdder products={allowedProducts} selectedIds={new Set(rows.map((r) => r.product.id))} search={search} onSearch={setSearch} onAdd={add} />
        {rows.map((row, i) => {
          const supplier = variant === "import" ? supplierId : row.supplierId;
          const missing = supplier && !prices.data?.some((p) => p.productId === row.product.id && p.supplierId === supplier);
          return <Card key={row.product.id}><CardBody style={{ paddingTop: spacing.lg, gap: spacing.md }}>
            <CardTitle>{row.product.name}</CardTitle>
            <Text style={{ color: colors.textMuted }}>{row.product.code} · {row.product.unit.name}</Text>
            {variant === "export" && <Select label="Nhà cung cấp" emptyLabel="Không chọn" value={row.supplierId}
              options={(prices.data ?? []).filter((p) => p.productId === row.product.id).map((p) => ({ value: p.supplierId, label: p.supplier.name }))}
              onChange={(next) => {
                const price = prices.data?.find((p) => p.productId === row.product.id && p.supplierId === next);
                patch(i, { supplierId: next, costPrice: String(price ? price.exportPrice : row.product.costPrice) });
              }} />}
            {!!missing && <Text style={{ color: colors.danger }}>Hàng hoá chưa có giá cho nhà cung cấp đã chọn. Hãy đổi nhà cung cấp hoặc bỏ dòng này.</Text>}
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label="Số lượng" required keyboardType="decimal-pad" value={row.quantity} onChangeText={(quantity) => patch(i, { quantity })} />
              <Input containerStyle={{ flex: 1 }} label="Giá vốn" required keyboardType="decimal-pad" value={row.costPrice} onChangeText={(costPrice) => patch(i, { costPrice })} />
            </View>
            <Input label="Ghi chú hàng hoá" value={row.note} onChangeText={(note) => patch(i, { note })} />
            <InfoRow label="Tiền vốn" value={formatCurrency((number(row.quantity) || 0) * (number(row.costPrice) || 0))} />
            <Button title="Bỏ dòng" variant="ghost" size="sm" onPress={() => setRows((prev) => prev.filter((_, j) => j !== i))} />
          </CardBody></Card>;
        })}
        <InfoRow label="Tổng tiền vốn" value={formatCurrency(total)} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button title="Lưu phiếu" loading={create.isPending} disabled={!!lookupError} onPress={submit} fullWidth />
      </Screen>}
  </>;
}
