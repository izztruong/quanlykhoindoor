import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  useDeleteSalesOrderItemImage,
  useSalesOrderItemImages,
  useUploadSalesOrderItemImages,
} from "@/hooks/useSalesOrders";
import { captureReceiptPhoto, pickReceiptPhotos } from "@/lib/imagePicker";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { SalesOrderItem } from "@/types";

/** Khớp MAX_IMAGES_PER_ORDER_ITEM ở server (salesOrders.schemas.ts). */
const MAX_IMAGES = 5;

interface OrderItemImagesModalProps {
  orderId: string;
  item: SalesOrderItem;
  /** ORDERS.APPROVE và đơn đã hoàn thành thì chụp/chọn thêm và xoá được ảnh. */
  canManage: boolean;
  onClose: () => void;
}

/**
 * Ảnh chứng từ của MỘT dòng hàng. Khác form khoản chi: dòng hàng đã có id nên ảnh chụp/chọn xong
 * là tải lên ngay, không có hàng "Chưa lưu". Lỗi tải lên đã có toast chung của MutationCache.
 */
export function OrderItemImagesModal({ orderId, item, canManage, onClose }: OrderItemImagesModalProps) {
  const imageCount = item.imageCount;
  const images = useSalesOrderItemImages(orderId, item.id, imageCount > 0);
  const upload = useUploadSalesOrderItemImages(orderId, item.id);
  const remove = useDeleteSalesOrderItemImage(orderId, item.id);
  /** Thời gian nén ảnh trên máy, trước khi mutation bắt đầu — cũng phải khoá nút. */
  const [preparing, setPreparing] = useState(false);

  const remaining = MAX_IMAGES - imageCount;
  const busy = preparing || upload.isPending;

  async function addPhotos(source: "camera" | "library") {
    if (remaining <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi hàng hoá tối đa ${MAX_IMAGES} ảnh chứng từ.`);
      return;
    }
    setPreparing(true);
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remaining);
      if (picked.length === 0) return;
      upload.mutate(
        picked.slice(0, remaining).map((img) => ({ contentType: img.contentType, dataBase64: img.dataBase64 })),
      );
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

  const footer = canManage ? (
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
  ) : undefined;

  return (
    <Modal
      visible
      title={`Chứng từ — ${item.product?.name ?? ""} (${imageCount}/${MAX_IMAGES})`}
      onClose={onClose}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.body}>
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
                <Pressable
                  style={styles.thumbRemove}
                  hitSlop={6}
                  accessibilityLabel="Xoá ảnh"
                  onPress={() => confirmDelete(image.id)}
                >
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
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md },
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
