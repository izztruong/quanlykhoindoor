import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, Text, View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChangePassword } from "@/lib/auth";
import { colors, fontSize, spacing } from "@/lib/theme";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
    newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
    confirmPassword: z.string().min(1, "Nhập lại mật khẩu mới"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Hai lần nhập chưa khớp",
  });

type FormValues = z.infer<typeof schema>;

/**
 * Đổi mật khẩu làm tăng tokenVersion nên token hiện tại chết theo — useChangePassword đã xoá token
 * và dọn cache, gác cửa ở app/_layout.tsx sẽ tự đưa về màn đăng nhập.
 */
export function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  return (
    <View style={styles.form}>
      <Text style={styles.notice}>Đổi mật khẩu xong bạn sẽ phải đăng nhập lại trên mọi thiết bị.</Text>
      <Controller
        control={control}
        name="currentPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Mật khẩu hiện tại"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.currentPassword?.message}
            secureTextEntry
          />
        )}
      />
      <Controller
        control={control}
        name="newPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Mật khẩu mới"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.newPassword?.message}
            secureTextEntry
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Nhập lại mật khẩu mới"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
            secureTextEntry
          />
        )}
      />
      <Button
        title="Đổi mật khẩu"
        fullWidth
        loading={changePassword.isPending}
        onPress={handleSubmit(({ currentPassword, newPassword }) =>
          changePassword.mutate({ currentPassword, newPassword }),
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: spacing.lg, gap: spacing.lg },
  notice: { fontSize: fontSize.sm, color: colors.textMuted },
});
