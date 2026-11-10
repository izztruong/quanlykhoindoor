import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useMaterialWasteImages } from "@/hooks/useMaterialWaste";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/**
 * Ảnh chứng minh trên màn chi tiết phiếu huỷ — chỉ xem; đính/gỡ ảnh nằm ở form tạo/sửa phiếu.
 * Chạm ảnh mở xem toàn màn hình, vuốt ngang qua lại (cùng khuôn OtherExpenseImageViewer).
 */
export function MaterialWasteImagesSection({ wasteId }: { wasteId: string }) {
  const insets = useSafeAreaInsets();
  const images = useMaterialWasteImages(wasteId);
  const items = images.data ?? [];
  const width = Dimensions.get("window").width;
  // null = đóng viewer; số = đang xem ảnh ở vị trí đó.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ảnh chứng minh</CardTitle>
        <Text style={styles.count}>{items.length} ảnh</Text>
      </CardHeader>
      <CardBody>
        {images.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>Phiếu này không có ảnh.</Text>
        ) : (
          <View style={styles.thumbRow}>
            {items.map((image, i) => (
              <Pressable
                key={image.id}
                accessibilityLabel={`Xem ảnh ${i + 1}`}
                onPress={() => {
                  setIndex(i);
                  setOpenIndex(i);
                }}
              >
                <Image source={{ uri: image.url }} style={styles.thumb} resizeMode="cover" />
              </Pressable>
            ))}
          </View>
        )}
      </CardBody>

      <Modal
        visible={openIndex !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setOpenIndex(null)}
        statusBarTranslucent
      >
        <View style={styles.viewerRoot}>
          <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
            <Text style={styles.counter}>{items.length > 0 ? `${Math.min(index + 1, items.length)}/${items.length}` : ""}</Text>
            <Pressable onPress={() => setOpenIndex(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Đóng">
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            initialScrollIndex={openIndex ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={[styles.page, { width }]}>
                <Image source={{ uri: item.url }} style={styles.image} resizeMode="contain" />
              </View>
            )}
          />
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: fontSize.sm, color: colors.textMuted },
  empty: { fontSize: fontSize.sm, color: colors.textFaint },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.subtle },
  viewerRoot: { flex: 1, backgroundColor: "#000000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  counter: { color: "#FFFFFF", fontSize: fontSize.md, fontWeight: "600" },
  page: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
});
