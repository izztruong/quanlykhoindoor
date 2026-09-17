import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SearchBar } from "@/components/ui/SearchBar";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface FilterBarProps {
  /** Các điều kiện đang lọc, đã đổi sang chữ cho người đọc. Rỗng = chưa lọc gì. */
  summary: string[];
  /** Số ô đang khác mặc định — hiện thành con số nhỏ trên phễu. */
  activeCount: number;
  onOpen: () => void;
  /** Có thì ô tìm kiếm nằm ngoài, cạnh phễu; không có thì phễu và dòng tóm tắt đứng chung một hàng. */
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
}

/**
 * Hàng đầu danh sách: một icon phễu cộng dòng tóm tắt đang lọc gì, thay cho việc bày hết ô lọc ra
 * ngoài. Tìm kiếm cố ý ở lại bên ngoài vì đó là thao tác hay dùng nhất, giấu sau một lần bấm là phiền.
 */
export function FilterBar({ summary, activeCount, onOpen, search }: FilterBarProps) {
  const summaryText = summary.length > 0 ? summary.join(" · ") : "Chưa lọc";

  const funnel = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={activeCount > 0 ? `Bộ lọc, đang lọc ${activeCount} mục` : "Bộ lọc"}
      onPress={onOpen}
      style={({ pressed }) => [styles.funnel, activeCount > 0 && styles.funnelActive, pressed && styles.pressed]}
    >
      <Ionicons name="funnel-outline" size={18} color={activeCount > 0 ? colors.primary : colors.textMuted} />
      {activeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );

  if (search) {
    return (
      <View style={styles.stack}>
        <View style={styles.row}>
          <View style={styles.searchSlot}>
            <SearchBar value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
          </View>
          {funnel}
        </View>
        <Text style={[styles.summary, summary.length === 0 && styles.summaryEmpty]} numberOfLines={1}>
          {summaryText}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {funnel}
      <Text style={[styles.summaryInline, summary.length === 0 && styles.summaryEmpty]} numberOfLines={1}>
        {summaryText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  searchSlot: { flex: 1 },
  funnel: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  funnelActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.onPrimary },
  summary: { fontSize: fontSize.sm, color: colors.textMuted, paddingHorizontal: spacing.xs },
  summaryInline: { flex: 1, fontSize: fontSize.sm, color: colors.textMuted },
  summaryEmpty: { color: colors.textFaint },
});
