import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import { Field, inputStyles } from "./Input";
import { Modal } from "./Modal";

export interface SelectOption {
  value: string;
  label: string;
  /** Dòng phụ mờ bên dưới nhãn — dùng cho mã hàng hoá, tên quán… */
  sublabel?: string;
}

interface SelectProps {
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Nhãn của lựa chọn rỗng. Có giá trị = cho phép bỏ chọn (ô lọc "Tất cả"). */
  emptyLabel?: string;
  /** Tự bật khi danh sách dài; đặt tường minh để ép hiện/ẩn ô tìm. */
  searchable?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SEARCH_THRESHOLD = 8;

export function Select({
  value,
  options,
  onChange,
  label,
  error,
  required,
  disabled,
  placeholder = "Chọn...",
  emptyLabel,
  searchable,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD;
  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.sublabel?.toLowerCase().includes(term),
    );
  }, [options, search]);

  function close() {
    setOpen(false);
    setSearch("");
  }

  function pick(next: string) {
    onChange(next);
    close();
  }

  const displayText = selected?.label ?? (value ? value : emptyLabel ?? placeholder);
  const isPlaceholder = !selected && !(emptyLabel && !value);

  return (
    <Field label={label} error={error} required={required} style={style}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          inputStyles.control,
          styles.control,
          !!error && styles.controlError,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.value, isPlaceholder && styles.placeholder]}
        >
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </Pressable>

      <Modal visible={open} title={label ?? "Chọn"} onClose={close}>
        {showSearch ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm kiếm"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              autoCorrect={false}
            />
          </View>
        ) : null}
        <FlatList
          data={visible}
          keyExtractor={(item) => item.value}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            emptyLabel ? (
              <Row label={emptyLabel} selected={!value} onPress={() => pick("")} muted />
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Không tìm thấy</Text>}
          renderItem={({ item }) => (
            <Row
              label={item.label}
              sublabel={item.sublabel}
              selected={item.value === value}
              onPress={() => pick(item.value)}
            />
          )}
        />
      </Modal>
    </Field>
  );
}

function Row({
  label,
  sublabel,
  selected,
  onPress,
  muted,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={styles.rowSublabel} numberOfLines={1}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  controlError: { borderColor: colors.danger },
  disabled: { backgroundColor: colors.subtle, opacity: 0.7 },
  pressed: { opacity: 0.7 },
  value: { flex: 1, fontSize: fontSize.md, color: colors.text },
  placeholder: { color: colors.textFaint },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.subtle },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: fontSize.md, color: colors.text },
  rowLabelMuted: { color: colors.textMuted },
  rowSublabel: { fontSize: fontSize.xs, color: colors.textFaint },
  empty: { textAlign: "center", color: colors.textFaint, paddingVertical: spacing.xxl, fontSize: fontSize.sm },
});
