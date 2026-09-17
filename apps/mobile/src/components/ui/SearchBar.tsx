import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

/** Ô tìm kiếm dùng chung cho các màn danh sách và các form chọn nhiều dòng. */
export function SearchBar({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityLabel="Xoá tìm kiếm">
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontSize: fontSize.md, color: colors.text },
});
