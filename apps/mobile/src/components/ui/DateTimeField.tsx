import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Field, inputStyles } from "./Input";
import { formatDateVN } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface DateTimeFieldProps {
  label?: string;
  /** Giữ thẳng Date, KHÔNG giữ chuỗi ISO đã cắt — xem ghi chú dưới. */
  value: Date;
  onChange: (value: Date) => void;
  error?: string;
  required?: boolean;
  /** Chỉ chọn ngày, bỏ phần giờ. */
  dateOnly?: boolean;
  maximumDate?: Date;
}

/**
 * Ô chọn ngày giờ. Trạng thái là một Date, và nơi gọi gửi đi bằng `.toISOString()` — tuyệt đối
 * không cắt chuỗi ISO như `iso.slice(0,16)`: cách đó lấy giờ UTC rồi hiểu theo giờ địa phương nên
 * mỗi lần lưu lại trừ mất 7 tiếng, mà đây chính là ranh giới kỳ của Check Cost.
 *
 * Dùng `onValueChange`/`onDismiss` chứ không phải `onChange` — `onChange` đã deprecated từ
 * datetimepicker v9 và in cảnh báo mỗi lần mở. Khác biệt quan trọng: sự kiện của `onValueChange`
 * KHÔNG có trường `type`, và nó chỉ chạy khi người dùng thực sự chọn xong; bấm huỷ thì `onDismiss`
 * chạy thay.
 */
export function DateTimeField({ label, value, onChange, error, required, dateOnly, maximumDate }: DateTimeFieldProps) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);

  /**
   * Android mở được từng phần một nên chọn ngày xong phải mở tiếp đồng hồ; iOS mở thẳng kiểu
   * datetime và giữ nguyên trên màn hình cho tới khi bấm Xong.
   */
  const androidTwoStep = Platform.OS === "android" && !dateOnly;

  function handleValueChange(selected: Date) {
    if (androidTwoStep && mode === "date") {
      // Giữ lại ngày vừa chọn rồi mở tiếp đồng hồ, không đụng tới phần giờ đang có.
      const next = new Date(value);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      onChange(next);
      setMode("time");
      return;
    }
    onChange(selected);
    // iOS hiển thị lịch ngay trong trang, đóng lại ngay sau lần chạm đầu thì không chỉnh được giờ.
    if (Platform.OS !== "ios") setMode(null);
  }

  return (
    <Field label={label} error={error} required={required}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setMode("date")}
        style={({ pressed }) => [inputStyles.control, styles.control, !!error && styles.controlError, pressed && styles.pressed]}
      >
        <Text style={styles.value}>
          {dateOnly ? formatDateVN(value.toISOString()).slice(0, 10) : formatDateVN(value.toISOString())}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textFaint} />
      </Pressable>

      {mode ? (
        <View style={Platform.OS === "ios" ? styles.iosPicker : undefined}>
          <DateTimePicker
            value={value}
            mode={Platform.OS === "ios" && !dateOnly ? "datetime" : mode}
            display={Platform.OS === "ios" ? "inline" : "default"}
            maximumDate={maximumDate}
            onValueChange={(_event, selected) => handleValueChange(selected)}
            onDismiss={() => setMode(null)}
          />
          {Platform.OS === "ios" ? (
            <Pressable onPress={() => setMode(null)} style={styles.iosDone} accessibilityRole="button">
              <Text style={styles.iosDoneText}>Xong</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  control: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  controlError: { borderColor: colors.danger },
  pressed: { opacity: 0.7 },
  value: { flex: 1, fontSize: fontSize.md, color: colors.text },
  iosPicker: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  iosDone: {
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  iosDoneText: { textAlign: "center", fontSize: fontSize.md, fontWeight: "700", color: colors.primary },
});
