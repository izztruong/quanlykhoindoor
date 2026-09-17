import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useChangeEmail } from "@/lib/auth";
import { spacing } from "@/lib/theme";

const schema = z.object({
  email: z.string().min(1, "Nhập email mới").email("Email không hợp lệ"),
  currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
});

type FormValues = z.infer<typeof schema>;

/** Đổi email cần mật khẩu hiện tại — server chặn, đây chỉ là lớp nhắc người dùng. */
export function ChangeEmailForm({ onDone }: { onDone: () => void }) {
  const changeEmail = useChangeEmail();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", currentPassword: "" },
  });

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Email mới"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        )}
      />
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
      <Button
        title="Lưu"
        fullWidth
        loading={changeEmail.isPending}
        onPress={handleSubmit((values) => changeEmail.mutate(values, { onSuccess: onDone }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: spacing.lg, gap: spacing.lg },
});
