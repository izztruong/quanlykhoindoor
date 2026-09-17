import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export interface MetaEntry {
  label: string;
  value: string;
}

interface ListRowCardProps {
  title: string;
  subtitle?: string;
  /** Các cột phụ của bảng bên web, xuống dòng thành cặp nhãn – giá trị. */
  meta?: MetaEntry[];
  /** Thẻ trạng thái ở góc phải trên, thường là <Badge/>. */
  badge?: React.ReactNode;
  onPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Nút phụ đứng trước Sửa/Xoá trong hàng hành động, vd "Xem ảnh". */
  actions?: React.ReactNode;
}

export function ListRowCard({ title, subtitle, meta, badge, onPress, onEdit, onDelete, actions }: ListRowCardProps) {
  const body = (
    <View style={styles.body}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge}
      </View>

      {meta && meta.length > 0 ? (
        <View style={styles.meta}>
          {meta.map((entry) => (
            <View key={entry.label} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{entry.label}</Text>
              <Text style={styles.metaValue} numberOfLines={1}>
                {entry.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {actions || onEdit || onDelete ? (
        <View style={styles.actions}>
          {actions}
          {onEdit ? <RowAction icon="pencil" label="Sửa" onPress={onEdit} /> : null}
          {onDelete ? <RowAction icon="trash-outline" label="Xoá" onPress={onDelete} danger /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Card>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Card>
  );
}

/** Nút nhỏ trong hàng hành động của thẻ. Xuất ra để màn khác dựng nút phụ trông giống hệt Sửa/Xoá. */
export function RowAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.action, danger && styles.actionDanger, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={15} color={tint} />
      <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.sm },
  pressed: { opacity: 0.7 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  titleBlock: { flex: 1, gap: 2 },
  title: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  meta: { gap: 4, paddingTop: spacing.xs },
  metaRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  metaLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  metaValue: { flex: 1, textAlign: "right", fontSize: fontSize.sm, color: colors.text },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
  },
  actionDanger: { backgroundColor: colors.dangerSoft },
  actionLabel: { fontSize: fontSize.sm, fontWeight: "600" },
});
