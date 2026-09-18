import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "@/components/layout/AppHeader";
import { ChangeEmailForm } from "@/components/profile/ChangeEmailForm";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Screen } from "@/components/ui/Screen";
import { useCurrentUser, useLogout } from "@/lib/auth";
import { openPrivacyPolicy, PRIVACY_POLICY_URL } from "@/lib/privacyPolicy";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

export default function MoreTab() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const [sheet, setSheet] = useState<"email" | "password" | null>(null);

  function confirmLogout() {
    Alert.alert("Đăng xuất", "Bạn có chắc muốn đăng xuất?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Đăng xuất", style: "destructive", onPress: () => logout.mutate() },
    ]);
  }

  return (
    <View style={styles.root}>
      <AppHeader title="Khác" />
      <Screen withTabBar>
        <Card>
          <CardHeader>
            <CardTitle>Thông tin tài khoản</CardTitle>
          </CardHeader>
          <CardBody>
            <InfoRow label="Tên" value={user?.name ?? "—"} />
            <InfoRow label="Email" value={user?.email ?? "—"} />
            <InfoRow label="Vai trò" value={user?.roleName ?? "—"} />
            <InfoRow label="Phạm vi dữ liệu" value={user?.scope === "ALL" ? "Tất cả quán" : "Chỉ dữ liệu của mình"} />
          </CardBody>
        </Card>

        <Card>
          <ActionRow icon="mail-outline" label="Đổi email" onPress={() => setSheet("email")} first />
          <ActionRow icon="lock-closed-outline" label="Đổi mật khẩu" onPress={() => setSheet("password")} />
          {PRIVACY_POLICY_URL ? (
            <ActionRow icon="shield-checkmark-outline" label="Chính sách quyền riêng tư" onPress={() => void openPrivacyPolicy()} />
          ) : null}
          <ActionRow icon="log-out-outline" label="Đăng xuất" onPress={confirmLogout} danger />
        </Card>
      </Screen>

      <Modal visible={sheet === "email"} title="Đổi email" onClose={() => setSheet(null)}>
        <ChangeEmailForm onDone={() => setSheet(null)} />
      </Modal>

      <Modal visible={sheet === "password"} title="Đổi mật khẩu" onClose={() => setSheet(null)}>
        <ChangePasswordForm />
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  danger,
  first,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
  danger?: boolean;
  first?: boolean;
}) {
  const tint = danger ? colors.danger : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionRow, !first && styles.actionDivider, pressed && styles.actionPressed]}
    >
      <View style={[styles.actionIcon, danger && styles.actionIconDanger]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={[styles.actionLabel, danger && styles.actionLabelDanger]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  infoLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  infoValue: { flex: 1, textAlign: "right", fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  // Cùng nhịp cao với hàng menu ở NavMenu.tsx, để ba tab nhìn như một hệ.
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actionPressed: { backgroundColor: colors.subtle },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconDanger: { backgroundColor: colors.dangerSoft },
  actionLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  actionLabelDanger: { color: colors.danger },
});
