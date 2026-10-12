import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Modal as RNModal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface ModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Nút/hành động ghim ở đáy, luôn nhìn thấy dù nội dung cuộn. */
  footer?: React.ReactNode;
}

/** Bàn phím đang mở hay không — chỉ để bỏ khoảng đệm safe-area, xem chú thích ở `paddingBottom`. */
function useKeyboardShown() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    // `will*` trên iOS khớp đúng nhịp animation của bàn phím; Android chỉ có `did*`.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setShown(true));
    const hide = Keyboard.addListener(hideEvent, () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

/**
 * Tấm trượt từ đáy lên — dạng quen thuộc trên điện thoại, thay cho hộp thoại giữa màn hình của
 * bản web. Bấm nền mờ là đóng, khác Modal bên web (ở đó cố ý không đóng).
 *
 * **Tấm trượt tự né bàn phím, đừng bọc thêm `KeyboardAvoidingView` ở chỗ gọi** — bọc chồng là bị đẩy
 * hai lần. `Modal` của React Native trên iOS là một window riêng nên hệ điều hành KHÔNG tự thu nhỏ
 * nó; thiếu lớp né này thì bàn phím che mất ô nhập và nút ở chân tấm trượt. Android không bị
 * (`windowSoftInputMode` mặc định của Expo là `adjustResize`) nên `behavior` để trống ở đó.
 */
export function Modal({ visible, title, onClose, children, footer }: ModalProps) {
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();

  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/*
        `pointerEvents="box-none"` là BẮT BUỘC: lớp này phủ toàn màn, không có nó thì nó nuốt mọi
        chạm ở vùng trống phía trên tấm trượt và chạm nền mờ sẽ không đóng được nữa.
      */}
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            // Bàn phím mở thì vùng home indicator đã nằm DƯỚI bàn phím; cộng thêm insets.bottom chỉ
            // chừa một dải trống thừa giữa nút và bàn phím.
            { paddingBottom: keyboardShown ? spacing.lg : Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Đóng">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(16,24,40,0.45)" },
  avoider: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    // KHÔNG dùng position: absolute. Phần tử tuyệt đối không đọc hộp nội dung của cha, nên
    // KeyboardAvoidingView có thêm padding cũng không đẩy được tấm trượt lên.
    //
    // maxHeight tính theo hộp nội dung của `avoider` — vốn đã bị trừ chiều cao bàn phím — nên 88%
    // tự thành "88% phần còn lại phía trên bàn phím".
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  title: { flex: 1, fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  body: { flexShrink: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
