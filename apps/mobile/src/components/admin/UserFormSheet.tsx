import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useRoleOptions } from "@/hooks/useRoles";
import { useCreateUser, useUpdateUser, type ManagedUser } from "@/hooks/useUsers";
import { isAssignableRole, userRoleLockReason } from "@/lib/adminPermissions";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";

export function UserFormSheet({ existing, systemCount, onClose }: { existing?: ManagedUser; systemCount: number; onClose: () => void }) {
  const { user: actor, can } = useCan();
  const roles = useRoleOptions();
  const create = useCreateUser();
  const update = useUpdateUser();
  const [name, setName] = useState(existing?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(existing?.role.id ?? "");
  const [error, setError] = useState("");
  const pending = create.isPending || update.isPending;
  const allowed = can("USERS", existing ? "EDIT" : "ADD");
  const lock = existing ? userRoleLockReason(existing, actor, systemCount) : "";
  const assignable = (roles.data ?? []).filter((role) => isAssignableRole(role, actor));
  const selectable = (roles.data ?? []).filter((role) => role.id === existing?.role.id || isAssignableRole(role, actor));
  const options = selectable.map((r) => ({ value: r.id, label: r.name }));
  if (existing && !options.some((r) => r.value === existing.role.id)) options.push({ value: existing.role.id, label: existing.role.name });
  const selectedId = lock && existing ? existing.role.id : roleId || assignable.find((r) => !r.isSystem)?.id || assignable[0]?.id || "";
  function submit() {
    if (pending || !allowed) return;
    setError("");
    if (!name.trim()) return setError("Vui lòng nhập họ tên.");
    if (!existing && !z.email().safeParse(email.trim()).success) return setError("Email không hợp lệ.");
    if ((!existing || password.length > 0) && password.length < 6) return setError("Mật khẩu phải có ít nhất 6 ký tự.");
    if (!selectedId) return setError("Vui lòng chọn vai trò.");
    if (selectedId !== existing?.role.id && !assignable.some((r) => r.id === selectedId)) return setError("Bạn không thể gán vai trò có quyền cao hơn mình.");
    if (existing) update.mutate({ id: existing.id, name: name.trim(), roleId: selectedId, password: password || undefined }, { onSuccess: onClose });
    else create.mutate({ name: name.trim(), email: email.trim(), password, roleId: selectedId }, { onSuccess: onClose });
  }
  return <Modal visible title={existing ? `Sửa tài khoản: ${existing.email}` : "Tạo tài khoản"} onClose={() => { if (!pending) onClose(); }}
    footer={<Button title="Lưu tài khoản" fullWidth onPress={submit} loading={pending} disabled={!allowed || roles.isLoading || !!roles.error} />}>
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      {!allowed && <ErrorState message="Bạn không có quyền thao tác tài khoản." />}
      {roles.isLoading && <LoadingState />}
      {roles.error && <><ErrorState message={roles.error.message} /><Button title="Tải lại vai trò" onPress={() => roles.refetch()} /></>}
      <Input label="Họ tên" required value={name} onChangeText={setName} editable={!pending} />
      {!existing && <Input label="Email" required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!pending} />}
      <Select label="Vai trò" required value={selectedId} options={options} onChange={setRoleId} disabled={!!lock || pending} />
      {lock ? <Text style={{ color: colors.textMuted }}>{lock}</Text> : null}
      <Input label={existing ? "Đặt lại mật khẩu" : "Mật khẩu"} required={!existing} value={password} onChangeText={setPassword} secureTextEntry
        autoCapitalize="none" autoCorrect={false} editable={!pending} placeholder={existing ? "Bỏ trống để giữ mật khẩu cũ" : "Tối thiểu 6 ký tự"}
        hint={existing ? "Đặt lại mật khẩu sẽ đăng xuất tài khoản này khỏi mọi thiết bị." : undefined} />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  </Modal>;
}
