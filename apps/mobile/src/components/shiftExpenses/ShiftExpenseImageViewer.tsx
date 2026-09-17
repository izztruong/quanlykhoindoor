import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
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
import { useShiftExpenseImages } from "@/hooks/useShiftExpenses";
import { colors, fontSize, spacing } from "@/lib/theme";

interface ShiftExpenseImageViewerProps {
  /** Khoản chi cần xem ảnh; `null` = đóng. */
  expenseId: string | null;
  onClose: () => void;
}

/**
 * Xem ảnh chứng từ toàn màn hình.
 *
 * Ảnh nạp theo yêu cầu, không nạp sẵn cho từng dòng danh sách: endpoint danh sách cố ý chỉ trả
 * `imageCount`, mỗi URL phải ký riêng và chỉ sống một giờ — 20 thẻ mà thẻ nào cũng tự gọi là 20 lượt
 * ký URL cho một màn hình.
 */
export function ShiftExpenseImageViewer({ expenseId, onClose }: ShiftExpenseImageViewerProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const images = useShiftExpenseImages(expenseId ?? "");
  const width = Dimensions.get("window").width;

  // Viewer nằm sẵn trong cây nên state không tự mất khi đóng — mở khoản chi khác phải về ảnh đầu,
  // nếu không bộ đếm sẽ hiện "3/1" của lần xem trước.
  useEffect(() => setIndex(0), [expenseId]);

  const items = images.data ?? [];

  return (
    <Modal visible={expenseId !== null} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
          <Text style={styles.counter}>
            {items.length > 0 ? `${Math.min(index + 1, items.length)}/${items.length}` : ""}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Đóng">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        {images.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.message}>Không tải được ảnh chứng từ.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) =>
              setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
            }
            renderItem={({ item }) => (
              <View style={[styles.page, { width }]}>
                <Image source={{ uri: item.url }} style={styles.image} resizeMode="contain" />
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  counter: { color: "#FFFFFF", fontSize: fontSize.md, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { color: colors.textFaint, fontSize: fontSize.sm },
  page: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
});
