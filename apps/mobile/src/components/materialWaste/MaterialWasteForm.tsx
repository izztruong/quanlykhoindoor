import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { GroupSection } from "@/components/ui/GroupSection";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { SearchBar } from "@/components/ui/SearchBar";
import { useFinishedGoodItems, useProducts } from "@/hooks/useCatalog";
import {
  useCreateMaterialWaste,
  useDeleteMaterialWasteImage,
  useMaterialWasteImages,
  useUpdateMaterialWaste,
  useUploadMaterialWasteImages,
} from "@/hooks/useMaterialWaste";
import type { CompressedImage } from "@/lib/imagePicker";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { MaterialWaste, Product, ProductType } from "@/types";
import { MaterialWasteImagePicker } from "./MaterialWasteImagePicker";

interface MaterialEntry {
  wholeQuantity: string;
  looseQuantity: string;
  note: string;
  deductInCostCheck: boolean;
}

interface FinishedEntry {
  quantity: string;
  note: string;
  deductInCostCheck: boolean;
}

const EMPTY_MATERIAL: MaterialEntry = { wholeQuantity: "", looseQuantity: "", note: "", deductInCostCheck: true };
const EMPTY_FINISHED: FinishedEntry = { quantity: "", note: "", deductInCostCheck: true };

const PRODUCT_TYPE_GROUPS: { key: ProductType; label: string }[] = [
  { key: "NVL", label: "Nguyên vật liệu" },
  { key: "COC_TAKE", label: "Cốc & ống hút" },
  { key: "BANH", label: "Bánh" },
  { key: "DUNG_CU", label: "Dụng cụ" },
  { key: "KHAC", label: "Khác" },
];

/** Khoá nhận dạng khu "Đồ thành phẩm" cho state mở/đóng — KHÔNG phải một giá trị category. */
const FINISHED_GROUP_KEY = "FINISHED";

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
      deductInCostCheck: it.deductInCostCheck,
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
      deductInCostCheck: it.deductInCostCheck,
    };
  }
  return entries;
}

/** Công tắc "trừ trong Check Cost" của một dòng huỷ; thiếu quyền DEDUCT thì chỉ xem. */
function DeductSwitch({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>Trừ trong Check Cost</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.borderStrong }}
      />
    </View>
  );
}

/**
 * Phiếu huỷ nguyên liệu. Khác phiếu kiểm kê ở chỗ không có loại phiếu và không chốt đơn giá —
 * giá trị huỷ được tính theo giá vốn hiện tại lúc xem báo cáo.
 */
export function MaterialWasteForm({ existing }: { existing?: MaterialWaste }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { can } = useCan();
  const canDeduct = can("MATERIAL_WASTE", "DEDUCT");
  const { data: products = [] } = useProducts({ activeOnly: true });
  // KHÔNG truyền quán: phiếu này luôn thuộc tài khoản đang đăng nhập, và server đã tự ép
  // phạm vi theo menu của quán đó (resolveMenuShopId). Truyền thêm chỉ sinh một lượt tải lại.
  const { data: finishedGoodItems = [] } = useFinishedGoodItems();
  const createWaste = useCreateMaterialWaste();
  const updateWaste = useUpdateMaterialWaste(existing?.id ?? "");
  const uploadImages = useUploadMaterialWasteImages();
  const deleteImage = useDeleteMaterialWasteImage(existing?.id ?? "");
  const savedImages = useMaterialWasteImages(existing?.id ?? "");
  /** Ảnh vừa chụp/chọn, chưa gửi lên — phiếu mới chưa có id để đính kèm. */
  const [pendingImages, setPendingImages] = useState<CompressedImage[]>([]);
  /** Id phiếu MỚI đã lưu ở lần bấm trước mà ảnh tải hỏng — lần bấm sau chỉ gửi lại ảnh. */
  const [createdId, setCreatedId] = useState<string | null>(null);

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

  /**
   * MỌI đồ thành phẩm, không lọc theo category — khớp với bản web.
   *
   * Trước đây chỉ hiện `THANH_PHAM`, nhưng huỷ một món ĐÃ PHA (`TRA`/`DAV`) là chuyện thật và đáng
   * khai: nguyên liệu đã rời kho mà không có doanh thu, nên không khai thì nó nằm im trong
   * `actualUsed` và hiện ra thành chênh lệch dương không ai giải thích được. Khai vào đây thì Check
   * Cost quy ngược về nguyên liệu qua công thức và dồn sang cột "Giá trị NVL huỷ".
   *
   * Không có nguy cơ đếm hai lần: món `TRA`/`DAV` không được đếm ở phiếu kiểm kê quán (form kiểm chỉ
   * liệt kê `THANH_PHAM`), và món bị bỏ cũng không có trong doanh số POS nên không vào `theoretical`.
   */
  const finishedGoodOptions = useMemo(
    () => [...finishedGoodItems].sort((a, b) => a.name.localeCompare(b.name)),
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

  async function submit() {
    if (createdId) {
      // Phiếu đã lưu ở lần bấm trước: chỉ gửi lại ảnh. Gọi lại POST là sinh phiếu trùng, còn PUT thì
      // quán (chỉ có quyền Thêm) không được gọi.
      if (await uploadPendingImages(createdId)) router.replace(`/material-waste/${createdId}`);
      return;
    }

    const items = Object.entries(materialEntries)
      .filter(([, entry]) => entry.wholeQuantity !== "" || entry.looseQuantity !== "")
      .map(([productId, entry]) => ({
        productId,
        wholeQuantity: entry.wholeQuantity !== "" ? Number(entry.wholeQuantity) : undefined,
        looseQuantity: entry.looseQuantity !== "" ? Number(entry.looseQuantity) : undefined,
        note: entry.note || undefined,
        deductInCostCheck: entry.deductInCostCheck,
      }));
    const finishedItems = Object.entries(finishedEntries)
      .filter(([, entry]) => entry.quantity !== "" && !Number.isNaN(Number(entry.quantity)))
      .map(([finishedGoodItemId, entry]) => ({
        finishedGoodItemId,
        quantity: Number(entry.quantity),
        note: entry.note || undefined,
        deductInCostCheck: entry.deductInCostCheck,
      }));

    if (items.length === 0 && finishedItems.length === 0) {
      Alert.alert("Thiếu số liệu", "Vui lòng nhập số lượng cho ít nhất 1 nguyên liệu hoặc đồ thành phẩm.");
      return;
    }

    const payload = { wasteAt: wasteAt.toISOString(), note: note || undefined, items, finishedItems };

    // Hai bước, vì phiếu mới chưa có id cho tới khi server trả về: lưu phiếu trước, rồi mới đẩy ảnh.
    let wasteId: string;
    let affectedCodes: string[] = [];
    try {
      if (isEdit && existing) {
        const updated = await updateWaste.mutateAsync(payload);
        wasteId = existing.id;
        affectedCodes = updated.affectedCostChecks.map((c) => c.code);
      } else {
        const created = await createWaste.mutateAsync(payload);
        wasteId = created.id;
        setCreatedId(created.id);
      }
    } catch {
      // Toast lỗi đã bắn ở mutationCache; ở lại form để sửa, không mất dữ liệu đã nhập.
      return;
    }

    if (!(await uploadPendingImages(wasteId))) return;

    if (affectedCodes.length > 0) {
      Alert.alert(
        "Đã lưu phiếu",
        `Phiếu này đã được dùng để tính các phiếu Check Cost sau — số liệu các phiếu đó CHƯA được cập nhật, vui lòng tạo lại nếu cần: ${affectedCodes.join(", ")}`,
        [{ text: "Đã hiểu", onPress: () => router.replace(`/material-waste/${wasteId}`) }],
      );
      return;
    }
    router.replace(`/material-waste/${wasteId}`);
  }

  /**
   * Đẩy ảnh đang chờ lên phiếu đã có id. Trả `true` nếu xong (hoặc không có ảnh). Hỏng thì báo rõ là
   * PHIẾU ĐÃ LƯU — người dùng cần biết điều đó thay vì tưởng mất trắng — và giữ ảnh lại để gửi lại.
   */
  async function uploadPendingImages(wasteId: string): Promise<boolean> {
    if (pendingImages.length === 0) return true;
    try {
      await uploadImages.mutateAsync({
        id: wasteId,
        images: pendingImages.map((img) => ({ contentType: img.contentType, dataBase64: img.dataBase64 })),
      });
      setPendingImages([]);
      return true;
    } catch {
      Alert.alert("Phiếu đã lưu, ảnh chưa tải được", "Bấm \"Gửi lại ảnh\" để thử lại.");
      return false;
    }
  }

  const saving = createWaste.isPending || updateWaste.isPending || uploadImages.isPending;

  return (
    <Screen>
      <Card>
        <CardBody style={styles.headerCard}>
          <DateTimeField label="Thời điểm huỷ" required value={wasteAt} onChange={setWasteAt} maximumDate={new Date()} />
          <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />
          <MaterialWasteImagePicker
            savedImages={savedImages.data ?? []}
            pending={pendingImages}
            onPendingChange={setPendingImages}
            onDeleteSaved={can("MATERIAL_WASTE", "EDIT") ? (imageId) => deleteImage.mutate(imageId) : undefined}
          />
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
                    {entry.wholeQuantity !== "" || entry.looseQuantity !== "" ? (
                      <DeductSwitch
                        value={entry.deductInCostCheck}
                        disabled={!canDeduct}
                        onChange={(next) => updateMaterialEntry(product.id, { deductInCostCheck: next })}
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </GroupSection>
        );
      })}

      <GroupSection
        label="Đồ thành phẩm"
        count={finishedGoodOptions.length}
        filledCount={finishedGoodOptions.filter((i) => finishedEntries[i.id]?.quantity).length}
        open={openGroup === FINISHED_GROUP_KEY}
        onToggle={() => setOpenGroup(openGroup === FINISHED_GROUP_KEY ? null : FINISHED_GROUP_KEY)}
      >
        {finishedGoodOptions.filter((i) => matchesQuery(i.name, i.code, search)).length === 0 ? (
          <Text style={styles.emptyRow}>Không tìm thấy đồ thành phẩm khớp bộ lọc.</Text>
        ) : (
          finishedGoodOptions
            .filter((i) => matchesQuery(i.name, i.code, search))
            .map((item) => {
              const entry = finishedEntries[item.id] ?? EMPTY_FINISHED;
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
                  {entry.quantity !== "" ? (
                    <DeductSwitch
                      value={entry.deductInCostCheck}
                      disabled={!canDeduct}
                      onChange={(next) => updateFinishedEntry(item.id, { deductInCostCheck: next })}
                    />
                  ) : null}
                </View>
              );
            })
        )}
      </GroupSection>

      <Button
        title={createdId ? "Gửi lại ảnh" : isEdit ? "Lưu thay đổi" : "Tạo phiếu huỷ"}
        fullWidth
        loading={saving}
        onPress={submit}
      />
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
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  emptyRow: { padding: spacing.lg, fontSize: fontSize.sm, color: colors.textFaint, textAlign: "center" },
});
