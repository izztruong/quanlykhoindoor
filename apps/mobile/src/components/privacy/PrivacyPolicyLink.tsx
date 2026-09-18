import { Pressable, StyleSheet, Text } from "react-native";
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from "@/lib/privacyPolicy";
import { colors, fontSize, spacing } from "@/lib/theme";

export function PrivacyPolicyLink() {
  if (!PRIVACY_POLICY_URL) return null;
  return (
    <Pressable onPress={() => void openPrivacyPolicy()} accessibilityRole="link" style={styles.link}>
      <Text style={styles.text}>Chính sách quyền riêng tư</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: "center", alignItems: "center", padding: spacing.sm },
  text: { fontSize: fontSize.sm, color: colors.primary, textDecorationLine: "underline", textAlign: "center" },
});
