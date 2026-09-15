"use client";

import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { useCostSummary, useUnconfirmedOrders, useWasteSummary } from "@/hooks/useDashboard";
import { useUserOptions } from "@/hooks/useUsers";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { DashboardCostMonth } from "@/types";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { MaterialCostChart } from "./MaterialCostChart";
import { SkyBackdrop } from "./SkyBackdrop";
import { StatCard, StatItem, StatRow } from "./StatCard";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * So chi phí tháng này với một tháng khác. Chi phí TĂNG là xấu nên tăng = đỏ, giảm = xanh.
 * Không có phiếu ở một trong hai tháng thì không so được — hiện "—" thay vì một con số vô nghĩa.
 */
function CostDelta({ current, reference, label }: { current: DashboardCostMonth; reference: DashboardCostMonth; label: string }) {
  const comparable = current.checkCount > 0 && reference.checkCount > 0 && reference.cost > 0;
  const change = comparable ? (current.cost - reference.cost) / reference.cost : 0;
  const Icon = change > 0 ? TrendingUp : TrendingDown;

  return (
    <div>
      {comparable ? (
        <div className={`flex items-center gap-1.5 text-base font-semibold ${change > 0 ? "text-red-600" : "text-emerald-600"}`}>
          <Icon size={18} aria-hidden />
          <span>{formatPercent(Math.abs(change))}</span>
          <span className="sr-only">{change > 0 ? "tăng" : "giảm"}</span>
        </div>
      ) : (
        <div className="text-base font-semibold text-slate-400">—</div>
      )}
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

export function DashboardClient() {
  const { user, can, scopeAll } = useCan();
  const currentYear = new Date().getFullYear();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [year, setYear] = useState(currentYear);

  const { data: users = [] } = useUserOptions({ enabled: scopeAll });
  // Phạm vi SELF không có ô chọn: đơn và phiếu huỷ server tự ép về chính mình, còn Check Cost không
  // áp phạm vi nên phải truyền id của mình để không cộng lẫn số của quán khác.
  const userId = scopeAll ? selectedUserId : (user?.id ?? "");

  const canOrders = can("ORDERS");
  const canWaste = can("MATERIAL_WASTE");
  const canCost = can("COST_CHECKS");

  const orders = useUnconfirmedOrders(userId, canOrders);
  const waste = useWasteSummary(userId, canWaste);
  const cost = useCostSummary(userId, year, canCost && !!user);

  const nothingToShow = !canOrders && !canWaste && !canCost;

  return (
    // Bù lại padding p-6 của <main> để nền trời tràn sát mép vùng nội dung, rồi đặt padding lại bên trong.
    <div className="relative -m-6 min-h-full p-6">
      <SkyBackdrop />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-slate-800">Trang chủ</h1>
          {scopeAll && !nothingToShow && (
            <div className="flex items-center gap-2">
              <label htmlFor="dashboard-user" className="text-sm font-medium text-slate-500">
                Quán
              </label>
              <div className="w-56">
                <Select id="dashboard-user" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                  <option value="">Tất cả quán</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </div>

        {nothingToShow ? (
          <Card className="p-5 text-sm text-slate-500">Tài khoản chưa được cấp quyền xem mục nào trên trang chủ.</Card>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-slate-800">Quản trị</h2>

            {canOrders && (
              <StatCard title="Đơn hàng chưa xác nhận" href="/orders" isLoading={orders.isLoading}>
                <div className="mt-2 text-2xl font-semibold text-slate-800">{formatNumber(orders.data ?? 0)} đơn</div>
              </StatCard>
            )}

            {canWaste && (
              <StatCard title="Huỷ hàng" href="/material-waste" isLoading={waste.isLoading}>
                {waste.data && (
                  <>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                      <span className="text-2xl font-semibold text-slate-800">{formatCurrency(Math.round(waste.data.value))}</span>
                      <span className="text-sm text-slate-500">Giá trị huỷ hàng (theo giá vốn hiện tại)</span>
                    </div>
                    <StatRow>
                      <StatItem value={formatNumber(waste.data.slipCount)} label={`Phiếu huỷ (${waste.data.days} ngày qua)`} />
                      <StatItem value={formatNumber(waste.data.itemCount)} label="Hàng hoá bị huỷ" />
                    </StatRow>
                  </>
                )}
              </StatCard>
            )}

            {canCost && (
              <>
                <StatCard
                  title={
                    cost.data
                      ? `Chi phí nguyên vật liệu ${pad2(cost.data.current.month)}/${cost.data.current.year}`
                      : "Chi phí nguyên vật liệu"
                  }
                  href="/cost-checks"
                  isLoading={cost.isLoading}
                >
                  {cost.data && (
                    <>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
                        <span className="text-2xl font-semibold text-slate-800">
                          {formatCurrency(Math.round(cost.data.current.cost))}
                        </span>
                        <span className="text-sm text-slate-500">
                          {cost.data.current.checkCount > 0
                            ? `(${formatPercent(cost.data.current.pct)} doanh thu)`
                            : "Chưa có phiếu Check Cost chốt kỳ trong tháng"}
                        </span>
                      </div>
                      <StatRow>
                        <CostDelta
                          current={cost.data.current}
                          reference={cost.data.previousMonth}
                          label="so với tháng trước"
                        />
                        <CostDelta
                          current={cost.data.current}
                          reference={cost.data.sameMonthLastYear}
                          label="so với cùng tháng năm trước"
                        />
                      </StatRow>
                    </>
                  )}
                </StatCard>

                <Card className="p-5">
                  <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-medium text-slate-700">Tỷ lệ chi phí nguyên vật liệu</h2>
                      <p className="text-xs text-slate-400">
                        Chi phí NVL / doanh thu thuần, mỗi phiếu Check Cost tính vào tháng của ngày chốt kỳ
                      </p>
                    </div>
                    <div className="w-32">
                      <Select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Năm">
                        {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
                          <option key={y} value={y}>
                            Năm {y}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  {cost.isLoading || !cost.data ? (
                    <p className="text-sm text-slate-400">Đang tải...</p>
                  ) : (
                    <MaterialCostChart months={cost.data.months} />
                  )}
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
