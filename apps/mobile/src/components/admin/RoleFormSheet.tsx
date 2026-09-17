import { useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { GroupSection } from "@/components/ui/GroupSection";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ErrorState, LoadingState } from "@/components/ui/Screen";
import { useCreateRole, usePermissionCatalog, useUpdateRole } from "@/hooks/useRoles";
import { roleEditLockReason, toggleRolePermission } from "@/lib/adminPermissions";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";
import type { Role, PermissionCatalog } from "@/types";

const lockedHint = "Bạn không có quyền này nên không cấp/gỡ được";
function PermissionSwitch({ label, value, disabled, onChange, hint }: {
  label: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void; hint?: string;
}) {
  return <View style={{ gap: spacing.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
      <Text style={{ flex: 1, color: disabled ? colors.textMuted : colors.text }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </View>
    {hint ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{hint}</Text> : null}
  </View>;
}

export function RoleFormSheet({ existing, onClose }: { existing?: Role; onClose: () => void }) {
  const { user, can } = useCan();
  const catalog = usePermissionCatalog();
  const create = useCreateRole();
  const update = useUpdateRole();
  const [name, setName] = useState(existing?.name ?? "");
  const [isShop, setIsShop] = useState(existing?.isShop ?? false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(existing?.permissions ?? []));
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pending = create.isPending || update.isPending;
  const lock = existing ? roleEditLockReason(existing, user) : "";
  const allowed = can("ROLES", existing ? "EDIT" : "ADD") && !lock;
  const editable = (code: string) => !!user && (user.isSystem || user.permissions.includes(code));
  const groups = new Map<string, PermissionCatalog["resources"]>();
  for (const resource of catalog.data?.resources ?? []) groups.set(resource.group, [...(groups.get(resource.group) ?? []), resource]);
  const scope = catalog.data?.scopeAll;
  function submit() {
    if (!allowed || pending || !catalog.data) return;
    setError("");
    if (!name.trim()) return setError("Vui lòng nhập tên vai trò.");
    const payload = { name: name.trim(), isShop, permissions: [...selected] };
    if (existing) update.mutate({ id: existing.id, ...payload }, { onSuccess: onClose });
    else create.mutate(payload, { onSuccess: onClose });
  }
  return <Modal visible title={existing ? `Sửa vai trò: ${existing.name}` : "Tạo vai trò"} onClose={() => { if (!pending) onClose(); }}
    footer={<Button title="Lưu vai trò" fullWidth onPress={submit} loading={pending} disabled={!allowed || !catalog.data || !!catalog.error} />}>
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
      {!allowed && <ErrorState message={lock || "Bạn không có quyền thao tác vai trò."} />}
      {catalog.isLoading && <LoadingState />}
      {catalog.error && <><ErrorState message={catalog.error.message} /><Button title="Tải lại danh sách quyền" onPress={() => catalog.refetch()} /></>}
      <Input label="Tên vai trò" required value={name} onChangeText={setName} editable={!!allowed && !pending} />
      <PermissionSwitch label="Là quán" value={isShop} disabled={!allowed || pending} onChange={setIsShop}
        hint="Tài khoản thuộc vai trò này sẽ xuất hiện trong các ô chọn/lọc quán." />
      {scope && <PermissionSwitch label={scope.label} value={selected.has(scope.code)} disabled={!allowed || pending || !editable(scope.code)}
        hint={!editable(scope.code) ? lockedHint : "Không bật: chỉ thao tác dữ liệu thuộc phạm vi tài khoản của mình."}
        onChange={(checked) => { if (editable(scope.code)) setSelected((prev) => { const next = new Set(prev); if (checked) next.add(scope.code); else next.delete(scope.code); return next; }); }} />}
      {[...groups].map(([group, resources]) => <GroupSection key={group} label={group} count={resources.length} open={openGroup === group}
        onToggle={() => setOpenGroup(openGroup === group ? null : group)}>
        {resources.map((resource) => <View key={resource.resource} style={{ padding: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontWeight: "700", color: colors.text }}>{resource.label}</Text>
          {resource.actions.map((action) => {
            const code = `${resource.resource}.${action}`;
            return <PermissionSwitch key={action} label={catalog.data!.actionLabels[action]} value={selected.has(code)}
              disabled={!allowed || pending || !editable(code)} hint={!editable(code) ? lockedHint : undefined}
              onChange={(checked) => setSelected((prev) => toggleRolePermission(prev, resource, action, checked, editable))} />;
          })}
        </View>)}
      </GroupSection>)}
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
    </ScrollView>
  </Modal>;
}
