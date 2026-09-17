import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { Input } from "@/components/ui/Input";
import { ApiError } from "@/lib/apiClient";
import { useLogin } from "@/lib/auth";
import { colors, fontSize, radius, spacing } from "@/lib/theme";

const schema = z.object({
  email: z.string().min(1, "Nhập email").email("Email không hợp lệ"),
  password: z.string().min(1, "Nhập mật khẩu"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const login = useLogin();
  const [googleBusy, setGoogleBusy] = useState(false);
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
                  onSubmitEditing={handleSubmit((values) => { if (!googleBusy && !login.isPending) login.mutate(values); })}
                  returnKeyType="go"
                />
              )}
            />

            {errorMessage ? <Text style={styles.serverError}>{errorMessage}</Text> : null}

            <Button
              title="Đăng nhập"
              fullWidth
              loading={login.isPending}
              disabled={googleBusy}
              onPress={handleSubmit((values) => login.mutate(values))}
            />
            <GoogleLoginButton disabled={login.isPending} onBusyChange={setGoogleBusy} />
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
  serverError: { fontSize: fontSize.sm, color: colors.danger, textAlign: "center" },
});
