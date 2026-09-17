import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { spacing } from "@/lib/theme";

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onClear: () => void;
  children: React.ReactNode;
}

/**
 * Dialog bộ lọc trượt từ dưới lên. Dùng lại Modal sẵn có (đã là bottom sheet: grabber, nút X, chạm
 * nền mờ để đóng) — đóng mà không bấm Áp dụng thì mọi thay đổi bị bỏ, xem useFilterSheet.
 *
 * Phải tự bọc ScrollView: thân của Modal để `flexShrink: 1` chứ không tự cuộn.
 */
export function FilterSheet({ visible, onClose, onApply, onClear, children }: FilterSheetProps) {
  return (
    <Modal
      visible={visible}
      title="Bộ lọc"
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button title="Xoá lọc" variant="secondary" style={styles.footerButton} onPress={onClear} />
          <Button title="Áp dụng" style={styles.footerButton} onPress={onApply} />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.lg },
  footer: { flexDirection: "row", gap: spacing.md },
  footerButton: { flex: 1 },
});
