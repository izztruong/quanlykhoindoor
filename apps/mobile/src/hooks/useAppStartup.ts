import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/auth";
import { can, hasScopeAll } from "@/lib/permissions";
import { useCostSummary, useUnconfirmedOrders, useWasteSummary } from "./useDashboard";
import { useUnreadNotificationCount } from "./useNotifications";
import { useUserOptions } from "./useUsers";

/** Tải vào đúng cache Trang chủ dùng, chỉ chặn lần đầu của mỗi phiên đăng nhập. */
export function useAppStartup() {
  const auth = useCurrentUser();
  const user = auth.data;
  const queryClient = useQueryClient();
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const ready = !!user && readyUserId === user.id;
  const enabled = !!user && !ready;
  const scopeAll = hasScopeAll(user);
  const userId = scopeAll ? "" : (user?.id ?? "");
  const canOrders = can(user, "ORDERS");
  const canWaste = can(user, "MATERIAL_WASTE");
  const canCost = can(user, "COST_CHECKS");
  const showUserFilter = scopeAll && (canOrders || canWaste || canCost);

  const orders = useUnconfirmedOrders(userId, enabled && canOrders);
  const waste = useWasteSummary(userId, enabled && canWaste);
  const cost = useCostSummary(userId, new Date().getFullYear(), enabled && canCost);
  const users = useUserOptions({ enabled: enabled && showUserFilter });
  const unread = useUnreadNotificationCount(enabled);
  const required = [
    ...(canOrders ? [orders] : []),
    ...(canWaste ? [waste] : []),
    ...(canCost ? [cost] : []),
    ...(showUserFilter ? [users] : []),
    unread,
  ];
  const allLoaded = required.every((query) => query.isSuccess);

  useEffect(() => {
    if (!user) setReadyUserId(null);
    else if (allLoaded) setReadyUserId(user.id);
  }, [user?.id, allLoaded]);

  async function retry() {
    if (user === undefined) {
      // Cancel trước refetch để một request đang treo không giữ nút Thử lại mãi.
      // Kết quả request cũ về muộn sẽ không được ghi vào query đã huỷ.
      await queryClient.cancelQueries({ queryKey: ["auth", "me"], exact: true });
      await auth.refetch();
      return;
    }
    if (!user || ready) return;
    await Promise.all([
      queryClient.cancelQueries({ queryKey: ["dashboard"] }),
      queryClient.cancelQueries({ queryKey: ["users", "options"] }),
      queryClient.cancelQueries({ queryKey: ["notifications", "unread-count"], exact: true }),
    ]);
    await Promise.all(required.map((query) => query.refetch()));
  }

  return {
    user,
    ready,
    waiting: user === undefined || (!!user && !ready),
    failed: user === undefined ? auth.isError : !!user && !ready && required.some((query) => query.isError),
    retry,
  };
}
