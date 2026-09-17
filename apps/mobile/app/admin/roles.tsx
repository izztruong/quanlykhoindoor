import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { RoleFormSheet } from "@/components/admin/RoleFormSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { Screen, ErrorState } from "@/components/ui/Screen";
import { useRoles, useDeleteRole } from "@/hooks/useRoles";
import { roleEditLockReason } from "@/lib/adminPermissions";
import { formatDateVN } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";
import type { Role } from "@/types";

export default function RolesScreen() {
  const { user, can } = useCan();
  const query = useRoles({ enabled: can("ROLES") });
  const remove = useDeleteRole();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const roles = query.data ?? [];
  function deleteRole(role: Role) {
    if (!can("ROLES", "DELETE") || remove.isPending || roleEditLockReason(role, user) || role._count.users > 0) return;
    Alert.alert("Xoá vai trò", `Xoá vai trò ${role.name}?`, [
      { text: "Huỷ", style: "cancel" }, { text: "Xoá", style: "destructive", onPress: () => remove.mutate(role.id) },
    ]);
  }
  return <><Stack.Screen options={{ title: "Vai trò & phân quyền" }} />
    <Screen scroll={false}>
      {!can("ROLES") ? <ErrorState message="Bạn không có quyền xem vai trò." /> : <>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm vai trò" />
          {can("ROLES", "ADD") && <Button title="Tạo vai trò" onPress={() => setEditing("new")} />}
        </View>
        {query.error && <ErrorState message={query.error.message} />}
        <DataList data={roles.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))} keyExtractor={(r) => r.id}
          isLoading={query.isLoading} isRefetching={query.isRefetching} onRefresh={() => query.refetch()}
          renderItem={(role) => {
            const lock = roleEditLockReason(role, user);
            const deleteLock = lock || (role._count.users > 0 ? "Không thể xoá vai trò đang có tài khoản sử dụng." : "");
            return <View style={{ gap: spacing.xs }}><ListRowCard title={role.name}
              badge={<Badge tone={role.isSystem ? "blue" : role.isShop ? "green" : "gray"}>{role.isSystem ? "Hệ thống" : role.isShop ? "Quán" : "Tuỳ chỉnh"}</Badge>}
              meta={[{ label: "Số quyền", value: role.isSystem ? "Toàn quyền" : String(role.permissions.length) },
                { label: "Số tài khoản", value: String(role._count.users) }, { label: "Ngày tạo", value: formatDateVN(role.createdAt) }]}
              onEdit={can("ROLES", "EDIT") && !lock ? () => setEditing(role) : undefined}
              onDelete={can("ROLES", "DELETE") && !deleteLock && !remove.isPending ? () => deleteRole(role) : undefined} />
              {(can("ROLES", "EDIT") && lock) || (can("ROLES", "DELETE") && deleteLock) ?
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{lock || deleteLock}</Text> : null}
            </View>;
          }} />
        {editing && <RoleFormSheet key={editing === "new" ? "new" : editing.id} existing={editing === "new" ? undefined : roles.find((r) => r.id === editing.id) ?? editing}
          onClose={() => setEditing(null)} />}
      </>}
    </Screen>
  </>;
}
