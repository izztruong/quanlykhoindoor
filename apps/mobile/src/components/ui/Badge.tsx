import { StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export type BadgeTone = "gray" | "green" | "red" | "yellow" | "blue";

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  gray: { bg: colors.neutralSoft, fg: colors.textMuted },
  green: { bg: colors.successSoft, fg: colors.success },
  red: { bg: colors.dangerSoft, fg: colors.danger },
  yellow: { bg: colors.warningSoft, fg: colors.warning },
  blue: { bg: colors.infoSoft, fg: colors.info },
};

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: BadgeTone }) {
  const { bg, fg } = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: { fontSize: fontSize.xs, fontWeight: "600" },
});
