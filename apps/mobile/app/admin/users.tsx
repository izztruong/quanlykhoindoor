import { Stack } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { UserFormSheet } from "@/components/admin/UserFormSheet";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { ListRowCard } from "@/components/ui/ListRowCard";
import { SearchBar } from "@/components/ui/SearchBar";
import { Screen, ErrorState } from "@/components/ui/Screen";
import { useUsers, useDeleteUser, type ManagedUser } from "@/hooks/useUsers";
import { userDeleteLockReason } from "@/lib/adminPermissions";
import { formatDateVN } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { colors, spacing } from "@/lib/theme";

export default function UsersScreen() {
  const { user, can } = useCan();
  const query = useUsers({ enabled: can("USERS") });
  const remove = useDeleteUser();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedUser | "new" | null>(null);
  const users = query.data ?? [];
  const systemCount = users.filter((u) => u.role.isSystem).length;
  const term = search.trim().toLowerCase();
  function deleteUser(target: ManagedUser) {
    if (remove.isPending || !can("USERS", "DELETE") || userDeleteLockReason(target, user, systemCount)) return;
    Alert.alert("Xoá tài khoản", `Xoá tài khoản ${target.email}?`, [
      { text: "Huỷ", style: "cancel" }, { text: "Xoá", style: "destructive", onPress: () => remove.mutate(target.id) },
    ]);
  }
  return <><Stack.Screen options={{ title: "Tài khoản người dùng" }} />
    <Screen scroll={false}>
      {!can("USERS") ? <ErrorState message="Bạn không có quyền xem tài khoản." /> : <>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Tìm tên, email hoặc vai trò" />
          {can("USERS", "ADD") && <Button title="Tạo tài khoản" onPress={() => setEditing("new")} />}
        </View>
        {query.error && <ErrorState message={query.error.message} />}
        <DataList data={users.filter((u) => `${u.name} ${u.email} ${u.role.name}`.toLowerCase().includes(term))}
          keyExtractor={(u) => u.id} isLoading={query.isLoading} isRefetching={query.isRefetching} onRefresh={() => query.refetch()}
          renderItem={(u) => {
            const lock = userDeleteLockReason(u, user, systemCount);
            return <View style={{ gap: spacing.xs }}><ListRowCard title={u.name} subtitle={u.email}
              badge={<Badge tone={u.role.isSystem ? "blue" : "gray"}>{u.role.name}</Badge>}
              meta={[{ label: "Ngày tạo", value: formatDateVN(u.createdAt) }]}
              onEdit={can("USERS", "EDIT") ? () => setEditing(u) : undefined}
              onDelete={can("USERS", "DELETE") && !lock && !remove.isPending ? () => deleteUser(u) : undefined} />
              {can("USERS", "DELETE") && lock ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{lock}</Text> : null}
            </View>;
          }} />
        {editing && <UserFormSheet key={editing === "new" ? "new" : editing.id} existing={editing === "new" ? undefined : users.find((u) => u.id === editing.id) ?? editing}
          systemCount={systemCount} onClose={() => setEditing(null)} />}
      </>}
    </Screen>
  </>;
}
