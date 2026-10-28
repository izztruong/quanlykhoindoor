import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAdvanceExpenseProposal, useUploadExpenseProposalImages } from "@/hooks/useExpenseProposals";
import { MAX_PROPOSAL_IMAGES } from "@/lib/expenseProposal";
import { formatCurrency } from "@/lib/format";
import { captureReceiptPhoto, pickReceiptPhotos, type CompressedImage } from "@/lib/imagePicker";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface ExpenseAdvanceModalProps {
  proposalId: string;
  /** Lần đầu thì điền sẵn số người lập đề nghị; tạm ứng thêm thì để trống. */
  initialAmount: number | null;
  /** Tổng dự kiến − tổng đã ứng. Server vẫn là nơi chốt trần, đây chỉ để báo sớm. */
  remaining: number;
  isFirst: boolean;
  /** Số ảnh chứng từ phiếu đã có — trần ảnh tính chung cho cả phiếu. */
  existingImageCount: number;
  onClose: () => void;
  /** Gọi khi server trả lỗi — màn chi tiết tải lại nếu là 409 (phiếu vừa đổi trạng thái). */
  onError: (err: unknown) => void;
}

/** Tấm trượt nhập số tiền tạm ứng, kèm ảnh chứng từ không bắt buộc — cùng luật với ExpenseAdvanceModal bên web. */
export function ExpenseAdvanceModal({
  proposalId,
  initialAmount,
  remaining,
  isFirst,
  existingImageCount,
  onClose,
  onError,
}: ExpenseAdvanceModalProps) {
  const advance = useAdvanceExpenseProposal(proposalId);
  const uploadImages = useUploadExpenseProposalImages(proposalId);
  const [amount, setAmount] = useState(initialAmount != null ? String(initialAmount) : "");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<CompressedImage[]>([]);
  /** Thời gian nén ảnh trên máy — cũng phải khoá nút chọn ảnh. */
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingPhotos = MAX_PROPOSAL_IMAGES - existingImageCount - photos.length;
  const busy = advance.isPending || uploading;

  async function addPhotos(source: "camera" | "library") {
    if (remainingPhotos <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ.`);
      return;
    }
    setPreparing(true);
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remainingPhotos);
      setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PROPOSAL_IMAGES - existingImageCount));
    } catch (err) {
      Alert.alert("Không lấy được ảnh", err instanceof Error ? err.message : "Vui lòng thử lại");
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    setError(null);
    const value = amount.trim() === "" ? null : Number(amount);
    if (value === null || Number.isNaN(value) || !(value > 0)) return setError("Số tiền tạm ứng phải lớn hơn 0.");
    if (value > remaining) return setError(`Tổng tạm ứng không được vượt tổng dự kiến — còn được ứng ${formatCurrency(remaining)}.`);

    try {
      await advance.mutateAsync({ amount: value, note: note.trim() || undefined });
    } catch (err) {
      return onError(err);
    }

    // Tạm ứng đã ghi rồi — ảnh lỗi vẫn đóng tấm trượt và báo rõ, không để người dùng tưởng chưa ứng
    // mà bấm lại (sẽ thành ứng hai lần).
    if (photos.length > 0) {
      setUploading(true);
      try {
        await uploadImages.mutateAsync(photos.map((p) => ({ contentType: p.contentType, dataBase64: p.dataBase64 })));
      } catch {
        Alert.alert("Chưa đính được ảnh", "Đã tạm ứng nhưng tải ảnh chứng từ lỗi. Có thể đính lại ở mục Chứng từ.");
      } finally {
        setUploading(false);
      }
    }
    onClose();
  }

  return (
    <Modal
      visible
      title={isFirst ? "Tạm ứng" : "Tạm ứng thêm"}
      onClose={busy ? () => undefined : onClose}
      footer={
        <Button
          title={uploading ? "Đang tải ảnh..." : "Xác nhận tạm ứng"}
          fullWidth
          loading={advance.isPending}
          disabled={busy || preparing}
          onPress={submit}
        />
      }
    >
      {/* ScrollView chứ không View trơn: trên máy nhỏ, phần trên bàn phím có thể không đủ cho ô
          tiền + ô ghi chú + ảnh + dòng lỗi, mà maxHeight của tấm trượt sẽ cắt mất phần thừa. */}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.remaining}>
          <Text style={styles.remainingLabel}>Còn được ứng</Text>
          <Text style={styles.remainingValue}>{formatCurrency(remaining)}</Text>
        </View>
        <Input
          label="Số tiền tạm ứng"
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          doneAccessory
          autoFocus
          error={error ?? undefined}
          hint={
            isFirst && initialAmount != null
              ? `Điền sẵn số người lập đề nghị (${formatCurrency(initialAmount)}) — sửa nếu ứng khác.`
              : undefined
          }
        />
        <Input label="Ghi chú" value={note} onChangeText={setNote} placeholder="Không bắt buộc" />

        <View style={styles.imagesBlock}>
          <Text style={styles.imagesLabel}>
            Chứng từ ({existingImageCount + photos.length}/{MAX_PROPOSAL_IMAGES}) <Text style={styles.optional}>— không bắt buộc</Text>
          </Text>
          {photos.length > 0 || preparing ? (
            <View style={styles.thumbRow}>
              {photos.map((photo) => (
                <View key={photo.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                  <Pressable
                    style={styles.thumbRemove}
                    hitSlop={6}
                    accessibilityLabel="Bỏ ảnh"
                    onPress={() => setPhotos((prev) => prev.filter((p) => p.uri !== photo.uri))}
                  >
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}
              {preparing ? (
                <View style={[styles.thumb, styles.thumbLoading]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.pair}>
            <Button
              title="Chụp ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || preparing || remainingPhotos <= 0}
              icon={<Ionicons name="camera-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("camera")}
            />
            <Button
              title="Chọn ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || preparing || remainingPhotos <= 0}
              icon={<Ionicons name="images-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("library")}
            />
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  remaining: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  remainingLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  remainingValue: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  imagesBlock: { gap: spacing.md },
  imagesLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  optional: { fontWeight: "400", color: colors.textFaint },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  thumbWrap: { width: 80, height: 80 },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.subtle },
  thumbLoading: { alignItems: "center", justifyContent: "center" },
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
});
