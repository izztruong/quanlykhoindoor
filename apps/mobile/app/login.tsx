import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { EnvBadge } from "@/components/layout/EnvBadge";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/apiClient";
import { useLogin } from "@/lib/auth";
import { getRememberLogin } from "@/lib/authToken";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const schema = z.object({
  email: z.string().min(1, "Nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const login = useLogin();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const busy = googleBusy || login.isPending || !preferenceReady;
  useEffect(() => {
    let active = true;
    void getRememberLogin().then((remember) => {
      if (active) { setRememberLogin(remember); setPreferenceReady(true); }
    });
    return () => { active = false; };
  }, []);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const errorMessage =
    login.error instanceof ApiError ? login.error.message : login.error ? "Không kết nối được máy chủ" : null;

  const submit = handleSubmit((values) => {
    if (!busy) login.mutate({ ...values, rememberLogin });
  });

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Ionicons name="cube" size={34} color={colors.primary} />
            </View>
            <Text style={styles.title}>Quản lý kho</Text>
            <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>
            <View>
              <EnvBadge />
            </View>
          </View>

          <View style={styles.form}>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Email"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.email?.message}
                  placeholder="ten@quanly.local"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="username"
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Mật khẩu"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.password?.message}
                  placeholder="••••••••"
                  secureTextEntry
                  textContentType="password"
                  onSubmitEditing={submit}
                  returnKeyType="go"
                />
              )}
            />

            <Pressable accessibilityRole="checkbox" accessibilityLabel="Ghi nhớ đăng nhập"
              accessibilityState={{ checked: rememberLogin, disabled: busy }} disabled={busy}
              onPress={() => setRememberLogin((value) => !value)} style={styles.rememberRow}>
              <Ionicons name={rememberLogin ? "checkbox" : "square-outline"} size={24} color={colors.primary} />
              <Text style={styles.rememberLabel}>Ghi nhớ đăng nhập</Text>
            </Pressable>

            {errorMessage ? <Text style={styles.serverError}>{errorMessage}</Text> : null}

            <Button
              title="Đăng nhập"
              fullWidth
              loading={login.isPending}
              disabled={busy}
              onPress={submit}
            />
            <GoogleLoginButton disabled={login.isPending || !preferenceReady} rememberLogin={rememberLogin} onBusyChange={setGoogleBusy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: "center", gap: spacing.sm },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  form: { gap: spacing.lg },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  rememberLabel: { flex: 1, fontSize: fontSize.md, color: colors.text },
  serverError: { fontSize: fontSize.sm, color: colors.danger, textAlign: "center" },
});
