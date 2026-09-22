import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  useDeleteExpenseProposalImage,
  useExpenseProposalImages,
  useUploadExpenseProposalImages,
} from "@/hooks/useExpenseProposals";
import { MAX_PROPOSAL_IMAGES } from "@/lib/expenseProposal";
import { captureReceiptPhoto, pickReceiptPhotos } from "@/lib/imagePicker";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface ExpenseProposalImagesCardProps {
  proposalId: string;
  imageCount: number;
  /** Có quyền Hoàn thành thì chụp/chọn thêm và xoá được ảnh. */
  canManage: boolean;
}

/**
 * Ảnh chứng từ của phiếu đã hoàn thành. Phiếu đã có id nên chụp/chọn xong là tải lên ngay. URL ký có
 * hạn chỉ tải khi phiếu có ảnh. Lỗi tải lên đã có toast chung của MutationCache.
 */
export function ExpenseProposalImagesCard({ proposalId, imageCount, canManage }: ExpenseProposalImagesCardProps) {
  const images = useExpenseProposalImages(proposalId, imageCount > 0);
  const upload = useUploadExpenseProposalImages(proposalId);
  const remove = useDeleteExpenseProposalImage(proposalId);
  const [preparing, setPreparing] = useState(false);

  const remaining = MAX_PROPOSAL_IMAGES - imageCount;
  const busy = preparing || upload.isPending;

  if (!canManage && imageCount === 0) return null;

  async function addPhotos(source: "camera" | "library") {
    if (remaining <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ.`);
      return;
    }
    setPreparing(true);
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remaining);
      if (picked.length === 0) return;
      upload.mutate(picked.slice(0, remaining).map((img) => ({ contentType: img.contentType, dataBase64: img.dataBase64 })));
    } catch (err) {
      Alert.alert("Không lấy được ảnh", err instanceof Error ? err.message : "Vui lòng thử lại");
    } finally {
      setPreparing(false);
    }
  }

  function confirmDelete(imageId: string) {
    Alert.alert("Xoá ảnh", "Xoá ảnh chứng từ này?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: () => remove.mutate(imageId) },
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Chứng từ ({imageCount}/{MAX_PROPOSAL_IMAGES})
        </CardTitle>
      </CardHeader>
      <CardBody style={styles.body}>
        {imageCount === 0 && !busy ? <Text style={styles.muted}>Chưa có ảnh chứng từ.</Text> : null}
        {images.isLoading && imageCount > 0 ? <ActivityIndicator color={colors.primary} /> : null}

        <View style={styles.thumbRow}>
          {images.data?.map((image) => (
            <View key={image.id} style={styles.thumbWrap}>
              {/* URL ký 1 giờ — mở bằng trình xem của máy để phóng to đọc chữ trên hoá đơn. */}
              <Pressable onPress={() => Linking.openURL(image.url)} accessibilityLabel="Xem ảnh cỡ đầy đủ">
                <Image source={{ uri: image.url }} style={styles.thumb} resizeMode="cover" />
              </Pressable>
              {canManage ? (
                <Pressable style={styles.thumbRemove} hitSlop={6} accessibilityLabel="Xoá ảnh" onPress={() => confirmDelete(image.id)}>
                  <Ionicons name="close" size={14} color={colors.onPrimary} />
                </Pressable>
              ) : null}
            </View>
          ))}
          {busy ? (
            <View style={[styles.thumb, styles.thumbLoading]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </View>
        {imageCount > 0 ? <Text style={styles.hint}>Bấm vào ảnh để xem cỡ đầy đủ.</Text> : null}

        {canManage ? (
          <View style={styles.pair}>
            <Button
              title="Chụp ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || remaining <= 0}
              icon={<Ionicons name="camera-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("camera")}
            />
            <Button
              title="Chọn ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || remaining <= 0}
              icon={<Ionicons name="images-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("library")}
            />
          </View>
        ) : null}
      </CardBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingTop: spacing.md },
  muted: { fontSize: fontSize.sm, color: colors.textMuted },
  hint: { fontSize: fontSize.xs, color: colors.textFaint },
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
