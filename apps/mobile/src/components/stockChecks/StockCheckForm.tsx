import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { GroupSection } from "@/components/ui/GroupSection";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateStockCheck, useUpdateStockCheck } from "@/hooks/useStockChecks";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { FinishedGoodItem, Product, ProductType, StockCheck, StockCheckType } from "@/types";

interface MaterialEntry {
  wholeQuantity: string;
  looseQuantity: string;
  wholePrice: string;
  loosePrice: string;
  note: string;
}

interface FinishedEntry {
  quantity: string;
  price: string;
  note: string;
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Giá mặc định gợi ý sẵn khi mở form: giá chẵn lấy thẳng Product.costPrice, giá lẻ quy về đơn vị
 * công thức bằng đúng công thức Check Cost đang dùng (costPrice ÷ recipeUnitsPerBaseUnit).
 * App không hiện ô giá cho đỡ rối, nhưng vẫn gửi lên để phiếu chốt được đơn giá lúc kiểm.
 */
function defaultMaterialEntry(product: Product): MaterialEntry {
  const costPrice = Number(product.costPrice) || 0;
  const factor = product.recipeUnitsPerBaseUnit != null ? Number(product.recipeUnitsPerBaseUnit) : 1;
  return {
    wholeQuantity: "",
    looseQuantity: "",
    wholePrice: costPrice ? String(costPrice) : "",
    loosePrice: costPrice && factor ? String(roundPrice(costPrice / factor)) : "",
    note: "",
  };
}

function defaultFinishedEntry(item: FinishedGoodItem): FinishedEntry {
  const sellingPrice = item.sellingPrice != null ? Number(item.sellingPrice) : 0;
  return { quantity: "", price: sellingPrice ? String(sellingPrice) : "", note: "" };
}

const PRODUCT_TYPE_GROUPS: { key: ProductType; label: string }[] = [
  { key: "NVL", label: "Nguyên vật liệu" },
  { key: "COC_TAKE", label: "Cốc & ống hút" },
  { key: "BANH", label: "Bánh" },
  { key: "DUNG_CU", label: "Dụng cụ" },
  { key: "KHAC", label: "Khác" },
];

const FINISHED_GROUP_KEY = "THANH_PHAM";

function matchesQuery(name: string, code: string, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}

function toMaterialEntries(check?: StockCheck): Record<string, MaterialEntry> {
  const entries: Record<string, MaterialEntry> = {};
  for (const it of check?.items ?? []) {
    // Phiếu cũ (tạo trước khi có cột giá) chưa có giá — rơi về giá gợi ý từ hàng hoá.
    const fallback = defaultMaterialEntry(it.product);
    entries[it.productId] = {
      wholeQuantity: it.wholeQuantity != null ? String(Number(it.wholeQuantity)) : "",
      looseQuantity: it.looseQuantity != null ? String(Number(it.looseQuantity)) : "",
      wholePrice: it.wholePrice != null ? String(Number(it.wholePrice)) : fallback.wholePrice,
      loosePrice: it.loosePrice != null ? String(Number(it.loosePrice)) : fallback.loosePrice,
      note: it.note ?? "",
    };
  }
  return entries;
}

function toFinishedEntries(check?: StockCheck): Record<string, FinishedEntry> {
  const entries: Record<string, FinishedEntry> = {};
  for (const it of check?.finishedItems ?? []) {
    const fallback = defaultFinishedEntry(it.finishedGoodItem);
    entries[it.finishedGoodItemId] = {
      quantity: it.quantity != null ? String(Number(it.quantity)) : "",
      price: it.price != null ? String(Number(it.price)) : fallback.price,
      note: it.note ?? "",
    };
  }
  return entries;
}

const TYPE_OPTIONS = [
  { value: "WEEKLY", label: "Phiếu tuần" },
  { value: "MONTHLY", label: "Phiếu tháng" },
];

/**
 * Bản web bày cả 5 bảng hàng hoá ra cùng lúc; trên điện thoại làm vậy thì mọi ô nhập đều mounted
 * và cuộn giật, nên ở đây mỗi nhóm là một khối gập lại được — chỉ nhóm đang mở mới dựng ô nhập.
 */
export function StockCheckForm({ existing }: { existing?: StockCheck }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createCheck = useCreateStockCheck();
  const updateCheck = useUpdateStockCheck(existing?.id ?? "");

  const [type, setType] = useState<StockCheckType>(existing?.type ?? "WEEKLY");
  const [checkedAt, setCheckedAt] = useState(() => (existing ? new Date(existing.checkedAt) : new Date()));
  const [note, setNote] = useState(existing?.note ?? "");
  const [materialEntries, setMaterialEntries] = useState(() => toMaterialEntries(existing));
  const [finishedEntries, setFinishedEntries] = useState(() => toFinishedEntries(existing));
  const [search, setSearch] = useState("");
  const [openGroup, setOpenGroup] = useState<string | null>("NVL");

  const productsByType = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const list = map.get(p.type) ?? [];
      list.push(p);
      map.set(p.type, list);
    }
    // Nhóm hàng hoá trước, rồi tới tên — giữ đúng thứ tự của bản web để hai bên đối chiếu được.
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          (a.productGroup?.name ?? "").localeCompare(b.productGroup?.name ?? "") || a.name.localeCompare(b.name),
      );
    }
    return map;
  }, [products]);

  const thanhPhamItems = useMemo(
    () => finishedGoodItems.filter((f) => f.category === "THANH_PHAM").sort((a, b) => a.name.localeCompare(b.name)),
    [finishedGoodItems],
  );

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const finishedById = useMemo(() => new Map(finishedGoodItems.map((f) => [f.id, f])), [finishedGoodItems]);

  function materialEntryFor(product: Product): MaterialEntry {
    return materialEntries[product.id] ?? defaultMaterialEntry(product);
  }

  function updateMaterialEntry(productId: string, patch: Partial<MaterialEntry>) {
    setMaterialEntries((prev) => {
      const product = productById.get(productId);
      const base =
        prev[productId] ??
        (product
          ? defaultMaterialEntry(product)
          : { wholeQuantity: "", looseQuantity: "", wholePrice: "", loosePrice: "", note: "" });
      return { ...prev, [productId]: { ...base, ...patch } };
    });
  }

  function finishedEntryFor(item: FinishedGoodItem): FinishedEntry {
    return finishedEntries[item.id] ?? defaultFinishedEntry(item);
  }

  function updateFinishedEntry(itemId: string, patch: Partial<FinishedEntry>) {
    setFinishedEntries((prev) => {
      const item = finishedById.get(itemId);
      const base = prev[itemId] ?? (item ? defaultFinishedEntry(item) : { quantity: "", price: "", note: "" });
      return { ...prev, [itemId]: { ...base, ...patch } };
    });
  }

  function filledCountForType(key: ProductType): number {
    return (productsByType.get(key) ?? []).filter((p) => {
      const entry = materialEntries[p.id];
      return entry && (entry.wholeQuantity !== "" || entry.looseQuantity !== "");
    }).length;
  }

  function submit() {
    const items = Object.entries(materialEntries)
      .filter(([, entry]) => entry.wholeQuantity !== "" || entry.looseQuantity !== "")
      .map(([productId, entry]) => ({
        productId,
        wholeQuantity: entry.wholeQuantity !== "" ? Number(entry.wholeQuantity) : undefined,
        looseQuantity: entry.looseQuantity !== "" ? Number(entry.looseQuantity) : undefined,
        wholePrice: entry.wholePrice !== "" ? Number(entry.wholePrice) : undefined,
        loosePrice: entry.loosePrice !== "" ? Number(entry.loosePrice) : undefined,
        note: entry.note || undefined,
      }));
    const finishedItems = Object.entries(finishedEntries)
      .filter(([, entry]) => entry.quantity !== "" && !Number.isNaN(Number(entry.quantity)))
      .map(([finishedGoodItemId, entry]) => ({
        finishedGoodItemId,
        quantity: Number(entry.quantity),
        price: entry.price !== "" ? Number(entry.price) : undefined,
        note: entry.note || undefined,
      }));

    if (items.length === 0 && finishedItems.length === 0) {
      Alert.alert("Thiếu số liệu", "Vui lòng nhập số lượng cho ít nhất 1 nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    const payload = {
      type,
      checkedAt: checkedAt.toISOString(),
      note: note || undefined,
      items,
      finishedItems,
    };

    if (isEdit && existing) {
      updateCheck.mutate(payload, {
        onSuccess: (updated) => {
          if (updated.affectedCostChecks.length > 0) {
            const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
            Alert.alert(
              "Đã lưu phiếu",
              `Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
              [{ text: "Đã hiểu", onPress: () => router.replace(`/stock-checks/${existing.id}`) }],
            );
            return;
          }
          router.replace(`/stock-checks/${existing.id}`);
        },
      });
      return;
    }

    createCheck.mutate(payload, { onSuccess: (created) => router.replace(`/stock-checks/${created.id}`) });
  }

  const saving = createCheck.isPending || updateCheck.isPending;

  return (
    <Screen>
      <Card>
        <CardBody style={styles.headerCard}>
          <Select
            label="Loại phiếu"
            required
            value={type}
            onChange={(value) => setType(value as StockCheckType)}
            options={TYPE_OPTIONS}
            searchable={false}
          />
          <DateTimeField
            label="Thời điểm kiểm"
            required
            value={checkedAt}
            onChange={setCheckedAt}
            // Server từ chối ngày kiểm ở tương lai — chặn luôn ở đây cho khỏi mất công gõ lại.
            maximumDate={new Date()}
          />
          <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
        </CardBody>
      </Card>

      <SearchBar value={search} onChange={setSearch} placeholder="Lọc theo tên hoặc mã..." />

      {PRODUCT_TYPE_GROUPS.map((group) => {
        const all = productsByType.get(group.key) ?? [];
        const filtered = all.filter((p) => matchesQuery(p.name, p.code, search));
        return (
          <GroupSection
            key={group.key}
            label={group.label}
            count={all.length}
            filledCount={filledCountForType(group.key)}
            open={openGroup === group.key}
            onToggle={() => setOpenGroup(openGroup === group.key ? null : group.key)}
          >
            {filtered.length === 0 ? (
              <Text style={styles.emptyRow}>
                {all.length === 0 ? "Không có hàng hoá nào trong nhóm này." : "Không tìm thấy hàng hoá khớp bộ lọc."}
              </Text>
            ) : (
              filtered.map((product) => {
                const entry = materialEntryFor(product);
                // SL lẻ tính theo đơn vị công thức (vd Gram); server sẽ tự trừ khối lượng vỏ.
                const looseUnit = product.recipeUnit?.name;
                return (
                  <View key={product.id} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {product.name}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {product.code} · {product.unit?.name ?? ""}
                    </Text>
                    <View style={styles.inputPair}>
                      <Input
                        containerStyle={styles.inputHalf}
                        label="SL chẵn"
                        value={entry.wholeQuantity}
                        onChangeText={(value) => updateMaterialEntry(product.id, { wholeQuantity: value })}
                        keyboardType="numeric"
                      />
                      <Input
                        containerStyle={styles.inputHalf}
                        label={looseUnit ? `SL lẻ (${looseUnit})` : "SL lẻ"}
                        value={entry.looseQuantity}
                        onChangeText={(value) => updateMaterialEntry(product.id, { looseQuantity: value })}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                );
              })
            )}
          </GroupSection>
        );
      })}

      <GroupSection
        label="Đồ thành phẩm"
        count={thanhPhamItems.length}
        filledCount={thanhPhamItems.filter((i) => finishedEntries[i.id]?.quantity).length}
        open={openGroup === FINISHED_GROUP_KEY}
        onToggle={() => setOpenGroup(openGroup === FINISHED_GROUP_KEY ? null : FINISHED_GROUP_KEY)}
      >
        {thanhPhamItems.filter((i) => matchesQuery(i.name, i.code, search)).length === 0 ? (
          <Text style={styles.emptyRow}>Không tìm thấy đồ thành phẩm khớp bộ lọc.</Text>
        ) : (
          thanhPhamItems
            .filter((i) => matchesQuery(i.name, i.code, search))
            .map((item) => {
              const entry = finishedEntryFor(item);
              return (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.code} · {item.unit?.name ?? ""}
                  </Text>
                  <Input
                    label="Số lượng"
                    value={entry.quantity}
                    onChangeText={(value) => updateFinishedEntry(item.id, { quantity: value })}
                    keyboardType="numeric"
                  />
                </View>
              );
            })
        )}
      </GroupSection>

      <Button title={isEdit ? "Lưu thay đổi" : "Tạo phiếu kiểm"} fullWidth loading={saving} onPress={submit} />
    </Screen>
  );
}


const styles = StyleSheet.create({
  headerCard: { gap: spacing.lg, paddingTop: spacing.lg },
  itemRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  itemMeta: { fontSize: fontSize.xs, color: colors.textFaint },
  inputPair: { flexDirection: "row", gap: spacing.md },
  inputHalf: { flex: 1 },
  emptyRow: { padding: spacing.lg, fontSize: fontSize.sm, color: colors.textFaint, textAlign: "center" },
});
