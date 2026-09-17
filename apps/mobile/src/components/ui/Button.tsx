import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Icon đặt trước nhãn, thường là một <Ionicons/>. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const backgrounds: Record<ButtonVariant, string> = {
  primary: colors.primary,
  secondary: colors.surface,
  ghost: "transparent",
  danger: colors.danger,
};

const labelColors: Record<ButtonVariant, string> = {
  primary: colors.onPrimary,
  secondary: colors.text,
  ghost: colors.primary,
  danger: colors.onPrimary,
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  fullWidth,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        { backgroundColor: backgrounds[variant] },
        variant === "secondary" && styles.bordered,
        fullWidth && styles.fullWidth,
        pressed && !inactive && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColors[variant]} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: labelColors[variant] }, size === "sm" && styles.labelSm]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  sm: { height: 36 },
  md: { height: 46 },
  bordered: { borderWidth: 1, borderColor: colors.borderStrong },
  fullWidth: { alignSelf: "stretch" },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontSize: fontSize.md, fontWeight: "600" },
  labelSm: { fontSize: fontSize.sm },
});
