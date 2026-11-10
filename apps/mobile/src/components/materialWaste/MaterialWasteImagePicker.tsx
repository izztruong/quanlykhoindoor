import { Ionicons } from "@expo/vector-icons";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { captureReceiptPhoto, pickReceiptPhotos, type CompressedImage } from "@/lib/imagePicker";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { MaterialWasteImage } from "@/types";

/** Trần ảnh của server (MAX_IMAGES_PER_WASTE) — cùng con số để không bấm chụp rồi mới bị từ chối. */
export const MAX_WASTE_IMAGES = 5;

interface MaterialWasteImagePickerProps {
  /** Ảnh đã lưu trên server (chỉ có khi sửa phiếu). */
  savedImages: MaterialWasteImage[];
  /** Ảnh vừa chụp/chọn, chưa gửi — form giữ state này vì phải gửi SAU khi phiếu đã có id. */
  pending: CompressedImage[];
  onPendingChange: (next: CompressedImage[]) => void;
  /** Bỏ trống = không hiện nút xoá ảnh đã lưu (thiếu quyền sửa). */
  onDeleteSaved?: (imageId: string) => void;
}

/** Khối "Ảnh chứng minh" của form phiếu huỷ — cùng giao diện với ảnh chứng từ khoản chi ngoài. */
export function MaterialWasteImagePicker({ savedImages, pending, onPendingChange, onDeleteSaved }: MaterialWasteImagePickerProps) {
  const remaining = MAX_WASTE_IMAGES - savedImages.length - pending.length;

  async function addPhotos(source: "camera" | "library") {
    if (remaining <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi phiếu huỷ tối đa ${MAX_WASTE_IMAGES} ảnh.`);
      return;
    }
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remaining);
      onPendingChange([...pending, ...picked].slice(0, MAX_WASTE_IMAGES - savedImages.length));
    } catch (err) {
      Alert.alert("Không lấy được ảnh", err instanceof Error ? err.message : "Vui lòng thử lại");
    }
  }

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        Ảnh chứng minh ({savedImages.length + pending.length}/{MAX_WASTE_IMAGES}) · không bắt buộc
      </Text>

      {savedImages.length + pending.length > 0 ? (
        <View style={styles.thumbRow}>
          {savedImages.map((image) => (
            <View key={image.id} style={styles.thumbWrap}>
              <Image source={{ uri: image.url }} style={styles.thumb} resizeMode="cover" />
              {onDeleteSaved ? (
                <Pressable
                  style={styles.thumbRemove}
                  hitSlop={6}
                  accessibilityLabel="Xoá ảnh"
                  onPress={() =>
                    Alert.alert("Xoá ảnh", "Xoá ảnh này khỏi phiếu huỷ?", [
                      { text: "Huỷ", style: "cancel" },
                      { text: "Xoá", style: "destructive", onPress: () => onDeleteSaved(image.id) },
                    ])
                  }
                >
                  <Ionicons name="close" size={14} color={colors.onPrimary} />
                </Pressable>
              ) : null}
            </View>
          ))}

          {pending.map((image, index) => (
            <View key={`${image.uri}-${index}`} style={styles.thumbWrap}>
              <Image source={{ uri: image.uri }} style={styles.thumb} resizeMode="cover" />
              <Pressable
                style={styles.thumbRemove}
                hitSlop={6}
                accessibilityLabel="Bỏ ảnh"
                onPress={() => onPendingChange(pending.filter((_, i) => i !== index))}
              >
                <Ionicons name="close" size={14} color={colors.onPrimary} />
              </Pressable>
              <View style={styles.pendingTag}>
                <Text style={styles.pendingTagText}>Chưa lưu</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

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
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
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
});
