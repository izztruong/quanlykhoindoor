import { forwardRef, useId } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Khung nhãn + lỗi dùng chung cho Input, Select và mọi ô nhập tự chế. */
export function Field({ label, error, hint, required, children, style }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Thanh "Xong" phía trên bàn phím, CHỈ có tác dụng trên iOS. Bàn phím `numeric`/`decimal-pad` của
   * iOS không có phím nào đóng được, mà ở trong tấm trượt thì vùng chạm ra ngoài gần như không còn.
   *
   * Bật tường minh chứ không tự suy từ `keyboardType`: phần lớn ô số của app nằm trong
   * `Screen`/`ScrollView`, chạm ra ngoài là đóng được rồi.
   */
  doneAccessory?: boolean;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, hint, required, containerStyle, style, doneAccessory, ...props },
  ref,
) {
  // useId() trả về chuỗi có dấu ":" — bỏ đi cho chắc vì đây là nativeID truyền xuống phía native.
  const accessoryId = useId().replace(/:/g, "");
  const withAccessory = doneAccessory && Platform.OS === "ios";

  return (
    <Field label={label} error={error} hint={hint} required={required} style={containerStyle}>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, !!error && styles.inputError, props.multiline && styles.multiline, style]}
        inputAccessoryViewID={withAccessory ? accessoryId : undefined}
        {...props}
      />
      {/* Chiều cao thanh này được cộng vào khung bàn phím mà hệ điều hành báo, nên
          KeyboardAvoidingView của ui/Modal tự tính đúng — không phải bù trừ tay. */}
      {withAccessory ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessoryBar}>
            <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8} accessibilityRole="button">
              <Text style={styles.accessoryDone}>Xong</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </Field>
  );
});

export const inputStyles = StyleSheet.create({
  /** Dùng lại cho Select và các ô tự dựng để mọi ô nhập cao bằng nhau. */
  control: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  required: { color: colors.danger },
  input: {
    ...inputStyles.control,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  inputError: { borderColor: colors.danger },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  error: { fontSize: fontSize.xs, color: colors.danger },
  hint: { fontSize: fontSize.xs, color: colors.textFaint },
  accessoryBar: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.subtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  accessoryDone: { fontSize: fontSize.md, fontWeight: "700", color: colors.primary },
});
