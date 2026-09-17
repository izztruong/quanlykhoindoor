import { Ionicons } from "@expo/vector-icons";
import { Link, type Href } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/ui/Card";
import { colors, fontSize, spacing } from "@/lib/theme";

interface StatCardProps {
  title: string;
  href?: Href;
  isLoading?: boolean;
  children?: React.ReactNode;
}

export function StatCard({ title, href, isLoading, children }: StatCardProps) {
  const header = (
    <View style={styles.header}>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {href ? (
        <View style={styles.link}>
          <Text style={styles.linkText}>Chi tiết</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      ) : null}
    </View>
  );

  return (
    <Card>
      <View style={styles.body}>
        {href ? (
          <Link href={href} asChild>
            <Pressable>{header}</Pressable>
          </Link>
        ) : (
          header
        )}
        {isLoading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : children}
      </View>
    </Card>
  );
}

/** Hàng số liệu phụ dưới con số chính, chia đều theo số cột. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemValue}>{value}</Text>
      <Text style={styles.itemLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  link: { flexDirection: "row", alignItems: "center", gap: 2 },
  linkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: "600" },
  loading: { alignSelf: "flex-start", marginVertical: spacing.md },
  row: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: { flex: 1, gap: 2 },
  itemValue: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  itemLabel: { fontSize: fontSize.xs, color: colors.textMuted },
});
