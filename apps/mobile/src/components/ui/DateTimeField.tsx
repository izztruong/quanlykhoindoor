import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Field, inputStyles } from "./Input";
import { Modal } from "./Modal";
import { formatDateVN } from "@/lib/format";
import { colors, fontSize, spacing } from "@/lib/theme";

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
    // iOS giữ lịch trong tấm trượt tới khi bấm Xong: đóng ngay sau lần chạm đầu thì không chỉnh được giờ.
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

      {Platform.OS === "ios" ? (
        /*
          Lịch inline của iOS là lịch của Apple, cần ~320pt mới đủ 7 cột. Mở ngay dưới ô thì nó chỉ
          rộng bằng ô — ở bộ lọc khoảng ngày hai ô đứng cạnh nhau, mỗi ô nửa màn hình, nên lịch bị cắt
          còn cột Thứ 2–Thứ 5 và mọi ngày Thứ 6–CN không chạm được. Mở trong tấm trượt thì lịch luôn
          rộng bằng màn hình, ô hẹp cỡ nào cũng vậy. Lồng trong FilterSheet (cũng là một Modal) vẫn
          được: iOS trình bày Modal con từ Modal đang mở, miễn là nó nằm trong cây con của Modal đó.
        */
        <Modal
          visible={mode !== null}
          title={label ?? (dateOnly ? "Chọn ngày" : "Chọn ngày giờ")}
          onClose={() => setMode(null)}
          footer={<Button title="Xong" fullWidth onPress={() => setMode(null)} />}
        >
          <View style={styles.iosPicker}>
            <DateTimePicker
              value={value}
              mode={dateOnly ? "date" : "datetime"}
              display="inline"
              maximumDate={maximumDate}
              onValueChange={(_event, selected) => handleValueChange(selected)}
            />
          </View>
        </Modal>
      ) : mode ? (
        <DateTimePicker
          value={value}
          mode={mode}
          display="default"
          maximumDate={maximumDate}
          onValueChange={(_event, selected) => handleValueChange(selected)}
          onDismiss={() => setMode(null)}
        />
      ) : null}
    </Field>
  );
}

const styles = StyleSheet.create({
  control: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  controlError: { borderColor: colors.danger },
  pressed: { opacity: 0.7 },
  value: { flex: 1, fontSize: fontSize.md, color: colors.text },
  iosPicker: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
