import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  useCreateShiftExpense,
  useDeleteShiftExpenseImage,
  useShiftExpenseImages,
  useUpdateShiftExpense,
  useUploadShiftExpenseImages,
} from "@/hooks/useShiftExpenses";
import { captureReceiptPhoto, pickReceiptPhotos, type CompressedImage } from "@/lib/imagePicker";
import { SHIFT_EXPENSE_TYPE_OPTIONS, formatCurrency } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ShiftExpense, ShiftExpenseType } from "@/types";

/** Trần ảnh của server — giữ cùng con số để người dùng không bấm chụp rồi mới bị từ chối. */
const MAX_IMAGES = 5;

function toDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface ShiftExpenseFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** Có giá trị = sửa khoản chi đang có; bỏ trống = thêm mới. */
  existing?: ShiftExpense | null;
}

export function ShiftExpenseFormModal({ visible, onClose, existing }: ShiftExpenseFormModalProps) {
  const isEdit = Boolean(existing);
  const create = useCreateShiftExpense();
  const update = useUpdateShiftExpense();
  const uploadImages = useUploadShiftExpenseImages();
  const deleteImage = useDeleteShiftExpenseImage(existing?.id ?? "");
  const images = useShiftExpenseImages(existing?.id ?? "");

  const [spentAt, setSpentAt] = useState(() => (existing ? new Date(existing.spentAt) : new Date()));
  const [type, setType] = useState<ShiftExpenseType>(existing?.type ?? "MATERIAL");
  const [content, setContent] = useState(existing?.content ?? "");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [quantity, setQuantity] = useState(existing ? String(Number(existing.quantity)) : "1");
  const [unitPrice, setUnitPrice] = useState(existing ? String(Number(existing.unitPrice)) : "");
  const [note, setNote] = useState(existing?.note ?? "");
  /** Ảnh vừa chụp/chọn, chưa gửi lên — khoản chi mới chưa có id để đính kèm. */
  const [pending, setPending] = useState<CompressedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploadedCount = images.data?.length ?? 0;
  const remaining = MAX_IMAGES - uploadedCount - pending.length;

  const amount = Number(quantity || 0) * Number(unitPrice || 0);

  async function addPhotos(source: "camera" | "library") {
    if (remaining <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi khoản chi tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remaining);
      setPending((prev) => [...prev, ...picked].slice(0, MAX_IMAGES - uploadedCount));
    } catch (err) {
      Alert.alert("Không lấy được ảnh", err instanceof Error ? err.message : "Vui lòng thử lại");
    }
  }

  function validate(): string | null {
    if (!content.trim()) return "Nhập nội dung chi";
    if (!(Number(quantity) > 0)) return "Số lượng phải lớn hơn 0";
    if (Number(unitPrice) < 0 || unitPrice === "") return "Nhập đơn giá";
    return null;
  }

  async function submit() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);

    const payload = {
      spentAt: toDateOnly(spentAt),
      type,
      content: content.trim(),
      unit: unit.trim() || undefined,
      quantity: Number(quantity),
      unitPrice: Number(unitPrice),
      note: note.trim() || undefined,
    };

    try {
      const saved = isEdit && existing ? await update.mutateAsync({ id: existing.id, data: payload }) : await create.mutateAsync(payload);
      if (pending.length > 0) {
        await uploadImages.mutateAsync({
          id: saved.id,
          images: pending.map((img) => ({ contentType: img.contentType, dataBase64: img.dataBase64 })),
        });
      }
      setPending([]);
      onClose();
    } catch {
      // Toast lỗi đã bắn ở mutationCache; giữ modal mở để người dùng sửa lại không mất dữ liệu.
    }
  }

  const saving = create.isPending || update.isPending || uploadImages.isPending;

  return (
    <Modal
      visible={visible}
      title={isEdit ? "Sửa khoản chi" : "Thêm khoản chi"}
      onClose={onClose}
      footer={<Button title="Lưu" fullWidth loading={saving} onPress={submit} />}
    >
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <DateTimeField label="Ngày chi" required dateOnly value={spentAt} onChange={setSpentAt} />
        <Select
          label="Loại chi"
          required
          value={type}
          onChange={(value) => setType(value as ShiftExpenseType)}
          options={SHIFT_EXPENSE_TYPE_OPTIONS}
          searchable={false}
        />
        <Input label="Nội dung chi" required value={content} onChangeText={setContent} />
        <Input label="Đơn vị" value={unit} onChangeText={setUnit} placeholder="Kg, Thùng, Lần..." />
        <View style={styles.pair}>
          <Input
            containerStyle={styles.half}
            label="Số lượng"
            required
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
          />
          <Input
            containerStyle={styles.half}
            label="Đơn giá"
            required
            value={unitPrice}
            onChangeText={setUnitPrice}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Thành tiền</Text>
          <Text style={styles.amountValue}>{formatCurrency(Math.round(amount))}</Text>
        </View>

        <Input label="Ghi chú" value={note} onChangeText={setNote} multiline />

        <View style={styles.imagesBlock}>
          <Text style={styles.imagesLabel}>
            Ảnh chứng từ ({uploadedCount + pending.length}/{MAX_IMAGES})
          </Text>

          <View style={styles.thumbRow}>
            {images.data?.map((image) => (
              <View key={image.id} style={styles.thumbWrap}>
                <Image source={{ uri: image.url }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.thumbRemove}
                  hitSlop={6}
                  accessibilityLabel="Xoá ảnh"
                  onPress={() =>
                    Alert.alert("Xoá ảnh", "Xoá ảnh này khỏi khoản chi?", [
                      { text: "Huỷ", style: "cancel" },
                      { text: "Xoá", style: "destructive", onPress: () => deleteImage.mutate(image.id) },
                    ])
                  }
                >
                  <Ionicons name="close" size={14} color={colors.onPrimary} />
                </Pressable>
              </View>
            ))}

            {pending.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.thumb} resizeMode="cover" />
                <Pressable
                  style={styles.thumbRemove}
                  hitSlop={6}
                  accessibilityLabel="Bỏ ảnh"
                  onPress={() => setPending((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close" size={14} color={colors.onPrimary} />
                </Pressable>
                <View style={styles.pendingTag}>
                  <Text style={styles.pendingTagText}>Chưa lưu</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.pair}>
            <Button
              title="Chụp ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              icon={<Ionicons name="camera-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("camera")}
            />
            <Button
              title="Chọn ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              icon={<Ionicons name="images-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("library")}
            />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { padding: spacing.lg, gap: spacing.lg },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  amountLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  amountValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  imagesBlock: { gap: spacing.md },
  imagesLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  thumbWrap: { width: 80, height: 80 },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.subtle },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTag: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(16,24,40,0.65)",
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    paddingVertical: 2,
  },
  pendingTagText: { fontSize: 10, color: colors.onPrimary, textAlign: "center" },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
