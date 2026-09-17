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
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import { useCreateMaterialWaste, useUpdateMaterialWaste } from "@/hooks/useMaterialWaste";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { MaterialWaste, Product, ProductType } from "@/types";

interface MaterialEntry {
  wholeQuantity: string;
  looseQuantity: string;
  note: string;
}

interface FinishedEntry {
  quantity: string;
  note: string;
}

const EMPTY_MATERIAL: MaterialEntry = { wholeQuantity: "", looseQuantity: "", note: "" };
const EMPTY_FINISHED: FinishedEntry = { quantity: "", note: "" };

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

function toMaterialEntries(waste?: MaterialWaste): Record<string, MaterialEntry> {
  const entries: Record<string, MaterialEntry> = {};
  for (const it of waste?.items ?? []) {
    entries[it.productId] = {
      wholeQuantity: it.wholeQuantity != null ? String(Number(it.wholeQuantity)) : "",
      looseQuantity: it.looseQuantity != null ? String(Number(it.looseQuantity)) : "",
      note: it.note ?? "",
    };
  }
  return entries;
}

function toFinishedEntries(waste?: MaterialWaste): Record<string, FinishedEntry> {
  const entries: Record<string, FinishedEntry> = {};
  for (const it of waste?.finishedItems ?? []) {
    entries[it.finishedGoodItemId] = {
      quantity: it.quantity != null ? String(Number(it.quantity)) : "",
      note: it.note ?? "",
    };
  }
  return entries;
}

/**
 * Phiếu huỷ nguyên liệu. Khác phiếu kiểm kê ở chỗ không có loại phiếu và không chốt đơn giá —
 * giá trị huỷ được tính theo giá vốn hiện tại lúc xem báo cáo.
 */
export function MaterialWasteForm({ existing }: { existing?: MaterialWaste }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createWaste = useCreateMaterialWaste();
  const updateWaste = useUpdateMaterialWaste(existing?.id ?? "");

  const [wasteAt, setWasteAt] = useState(() => (existing ? new Date(existing.wasteAt) : new Date()));
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

  function updateMaterialEntry(productId: string, patch: Partial<MaterialEntry>) {
    setMaterialEntries((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? EMPTY_MATERIAL), ...patch } }));
  }

  function updateFinishedEntry(itemId: string, patch: Partial<FinishedEntry>) {
    setFinishedEntries((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? EMPTY_FINISHED), ...patch } }));
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
        note: entry.note || undefined,
      }));
    const finishedItems = Object.entries(finishedEntries)
      .filter(([, entry]) => entry.quantity !== "" && !Number.isNaN(Number(entry.quantity)))
      .map(([finishedGoodItemId, entry]) => ({
        finishedGoodItemId,
        quantity: Number(entry.quantity),
        note: entry.note || undefined,
      }));

    if (items.length === 0 && finishedItems.length === 0) {
      Alert.alert("Thiếu số liệu", "Vui lòng nhập số lượng cho ít nhất 1 nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    const payload = { wasteAt: wasteAt.toISOString(), note: note || undefined, items, finishedItems };

    if (isEdit && existing) {
      updateWaste.mutate(payload, {
        onSuccess: (updated) => {
          if (updated.affectedCostChecks.length > 0) {
            const codes = updated.affectedCostChecks.map((c) => c.code).join(", ");
            Alert.alert(
              "Đã lưu phiếu",
              `Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${codes}`,
              [{ text: "Đã hiểu", onPress: () => router.replace(`/material-waste/${existing.id}`) }],
            );
            return;
          }
          router.replace(`/material-waste/${existing.id}`);
        },
      });
      return;
    }

    createWaste.mutate(payload, { onSuccess: (created) => router.replace(`/material-waste/${created.id}`) });
  }

  const saving = createWaste.isPending || updateWaste.isPending;

  return (
    <Screen>
      <Card>
        <CardBody style={styles.headerCard}>
          <DateTimeField label="Thời điểm huỷ" required value={wasteAt} onChange={setWasteAt} maximumDate={new Date()} />
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
                const entry = materialEntries[product.id] ?? EMPTY_MATERIAL;
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
            .map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.code} · {item.unit?.name ?? ""}
                </Text>
                <Input
                  label="Số lượng"
                  value={(finishedEntries[item.id] ?? EMPTY_FINISHED).quantity}
                  onChangeText={(value) => updateFinishedEntry(item.id, { quantity: value })}
                  keyboardType="numeric"
                />
              </View>
            ))
        )}
      </GroupSection>

      <Button title={isEdit ? "Lưu thay đổi" : "Tạo phiếu huỷ"} fullWidth loading={saving} onPress={submit} />
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
