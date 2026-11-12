"use client";

import { BackToListLink } from "@/components/ui/BackToListLink";
import { BakeryOrderStatusBadge } from "@/components/bakeryOrders/BakeryOrderStatusBadge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useBakeryOrder, useBakeryOrderAction } from "@/hooks/useBakeryOrders";
import { ApiError } from "@/lib/api-client";
import { nowForDatetimeLocal, toDatetimeLocal } from "@/lib/dateRange";
import { formatDateOnly, formatDateTime, formatNumber } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import type { AffectedCostCheck, BakeryOrder, BakeryOrderItem } from "@/types";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useState } from "react";

/** Cột số lượng của từng bước, theo đúng thứ tự luồng. */
const STEPS = [
  { key: "orderedQty", label: "Đặt" },
  { key: "confirmedQty", label: "Tiệm bánh XN" },
  { key: "pickedUpQty", label: "VC lấy" },
  { key: "receivedQty", label: "Quán nhận" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

/** Bước đang chờ nhập ở từng trạng thái, và cột của bước trước để điền sẵn. */
const ACTIVE_STEP: Partial<Record<BakeryOrder["status"], { column: StepKey; prefillFrom: StepKey }>> = {
  ORDERED: { column: "confirmedQty", prefillFrom: "orderedQty" },
  CONFIRMED: { column: "pickedUpQty", prefillFrom: "confirmedQty" },
  IN_TRANSIT: { column: "receivedQty", prefillFrom: "pickedUpQty" },
};

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));
const parseQty = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));

function affectedMessage(list: AffectedCostCheck[]) {
  if (list.length === 0) return;
  alert(
    `Ngày nhận nằm trong kỳ của ${list.length} phiếu Check Cost đã chốt (${list.map((cc) => cc.code).join(", ")}). ` +
      "Hãy tạo lại những phiếu đó để số liệu khớp.",
  );
}

export function BakeryOrderDetailClient({ id }: { id: string }) {
  const { data: order, isLoading } = useBakeryOrder(id);
  const { user, can, scopeAll } = useCan();
  const actions = useBakeryOrderAction(id);

  // Ô nhập của bước đang chờ (hoặc của lần admin sửa SL nhận). null = không ở chế độ nhập.
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [receivedAt, setReceivedAt] = useState("");
  const [editingReceived, setEditingReceived] = useState(false);
  const [error, setError] = useState("");

  if (isLoading || !order) return <p className="text-slate-400">Đang tải...</p>;

  const items = order.items ?? [];
  const isBakerySide = scopeAll || user?.id === order.supplier.bakeryUserId;
  const isShopSide = scopeAll || user?.id === order.shopUserId;

  // Ai được nhập ở bước đang chờ. Server chốt lại y như vậy — đây chỉ để ẩn nút.
  const canActNow =
    (order.status === "ORDERED" && can("BAKERY_ORDERS", "CONFIRM") && isBakerySide) ||
    (order.status === "CONFIRMED" && can("BAKERY_ORDERS", "PICKUP")) ||
    (order.status === "IN_TRANSIT" && can("BAKERY_ORDERS", "RECEIVE") && isShopSide);
  const canCancel = order.status === "ORDERED" && can("BAKERY_ORDERS", "CANCEL") && isShopSide;
  const canReject = order.status === "ORDERED" && can("BAKERY_ORDERS", "CONFIRM") && isBakerySide;
  const canEditReceived = order.status === "COMPLETED" && can("BAKERY_ORDERS", "EDIT");

  const active = editingReceived ? { column: "receivedQty" as StepKey, prefillFrom: "receivedQty" as StepKey } : ACTIVE_STEP[order.status];
  const inputColumn = canActNow || editingReceived ? active?.column : undefined;
  const values: Record<string, string> =
    draft ?? Object.fromEntries(items.map((it) => [it.productId, String(num(it[active?.prefillFrom ?? "orderedQty"]) ?? "")]));
  const showReceivedAt = inputColumn === "receivedQty";
  const effectiveReceivedAt = receivedAt || (editingReceived && order.receivedAt ? toDatetimeLocal(order.receivedAt) : nowForDatetimeLocal());

  const pending =
    actions.confirm.isPending ||
    actions.reject.isPending ||
    actions.cancel.isPending ||
    actions.pickUp.isPending ||
    actions.receive.isPending ||
    actions.editReceived.isPending;

  const onError = (err: unknown) => setError(err instanceof ApiError ? err.message : "Thao tác thất bại");
  const reset = () => {
    setDraft(null);
    setReceivedAt("");
    setEditingReceived(false);
    setError("");
  };

  function collect() {
    const result = items.map((it) => ({ productId: it.productId, quantity: parseQty(values[it.productId] ?? "") }));
    if (result.some((r) => !Number.isFinite(r.quantity) || r.quantity < 0)) {
      setError("Mỗi dòng cần một số lượng từ 0 trở lên");
      return null;
    }
    return result;
  }

  function submitStep() {
    setError("");
    const stepItems = collect();
    if (!stepItems) return;
    if (editingReceived) {
      actions.editReceived.mutate(
        { items: stepItems, receivedAt: new Date(effectiveReceivedAt).toISOString() },
        {
          onSuccess: (result) => {
            reset();
            affectedMessage(result.affectedCostChecks);
          },
          onError,
        },
      );
    } else if (order!.status === "ORDERED") {
      actions.confirm.mutate(stepItems, { onSuccess: reset, onError });
    } else if (order!.status === "CONFIRMED") {
      actions.pickUp.mutate(stepItems, { onSuccess: reset, onError });
    } else if (order!.status === "IN_TRANSIT") {
      actions.receive.mutate(
        { items: stepItems, receivedAt: new Date(effectiveReceivedAt).toISOString() },
        {
          onSuccess: (result) => {
            reset();
            affectedMessage(result.affectedCostChecks);
          },
          onError,
        },
      );
    }
  }

  const submitLabel = editingReceived
    ? "Lưu số lượng nhận"
    : order.status === "ORDERED"
      ? "Xác nhận đơn"
      : order.status === "CONFIRMED"
        ? "Xác nhận đã lấy hàng"
        : "Xác nhận đã nhận hàng";

  const total = (key: StepKey) => items.reduce((sum, it) => sum + (num(it[key]) ?? 0), 0);
  const bakeryShort = items.reduce((sum, it) => (it.confirmedQty == null ? sum : sum + Number(it.orderedQty) - Number(it.confirmedQty)), 0);
  const transitLoss = items.reduce(
    (sum, it) => (it.pickedUpQty == null || it.receivedQty == null ? sum : sum + Number(it.pickedUpQty) - Number(it.receivedQty)),
    0,
  );

  /** Ô lệch với bước liền trước thì tô màu — lệch ở đâu là thấy ngay ở đó. */
  function differsFromPrevious(it: BakeryOrderItem, stepIndex: number) {
    if (stepIndex === 0) return false;
    const current = num(it[STEPS[stepIndex].key]);
    const previous = num(it[STEPS[stepIndex - 1].key]);
    return current != null && previous != null && current !== previous;
  }

  return (
    <div className="flex flex-col gap-4">
      <BackToListLink href="/bakery-orders" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách order bánh
      </BackToListLink>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">Order bánh {order.code}</h1>
            <BakeryOrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-slate-500">
            {order.shopUser.name} đặt từ {order.supplier.name} · giao ngày {formatDateOnly(order.deliveryOn)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canReject && (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => window.confirm(`Từ chối đơn ${order.code}?`) && actions.reject.mutate(undefined, { onSuccess: reset, onError })}
            >
              Từ chối
            </Button>
          )}
          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => window.confirm(`Huỷ đơn ${order.code}?`) && actions.cancel.mutate(undefined, { onSuccess: reset, onError })}
            >
              Huỷ đơn
            </Button>
          )}
          {canEditReceived && !editingReceived && (
            <Button variant="secondary" size="sm" onClick={() => setEditingReceived(true)}>
              Sửa SL nhận / ngày nhận
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Số lượng qua từng bước</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-4 py-2">Bánh</th>
                  <th className="border border-slate-200 px-4 py-2">ĐVT</th>
                  {STEPS.map((step) => (
                    <th key={step.key} className={cn("w-28 border border-slate-200 px-4 py-2 text-right", step.key === inputColumn && "bg-indigo-50")}>
                      {step.label}
                    </th>
                  ))}
                  <th className="border border-slate-200 px-4 py-2 text-right">Hao hụt VC</th>
                  <th className="border border-slate-200 px-4 py-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const loss = it.pickedUpQty != null && it.receivedQty != null ? Number(it.pickedUpQty) - Number(it.receivedQty) : null;
                  return (
                    <tr key={it.id}>
                      <td className="border border-slate-200 px-4 py-2">{it.product.name}</td>
                      <td className="border border-slate-200 px-4 py-2">{it.product.unit?.name ?? "-"}</td>
                      {STEPS.map((step, stepIndex) =>
                        step.key === inputColumn ? (
                          <td key={step.key} className="border border-slate-200 bg-indigo-50 px-2 py-1">
                            <Input
                              inputMode="decimal"
                              className="h-8 text-right"
                              value={values[it.productId] ?? ""}
                              onChange={(e) => setDraft({ ...values, [it.productId]: e.target.value })}
                            />
                          </td>
                        ) : (
                          <td
                            key={step.key}
                            className={cn(
                              "border border-slate-200 px-4 py-2 text-right",
                              differsFromPrevious(it, stepIndex) && "bg-amber-50 font-medium text-amber-700",
                            )}
                          >
                            {num(it[step.key]) == null ? "—" : formatNumber(num(it[step.key])!)}
                          </td>
                        ),
                      )}
                      <td className={cn("border border-slate-200 px-4 py-2 text-right", loss && loss > 0 && "font-medium text-red-600")}>
                        {loss == null ? "—" : formatNumber(loss)}
                      </td>
                      <td className="border border-slate-200 px-4 py-2">{it.note || "-"}</td>
                    </tr>
                  );
                })}
                <tr className="font-medium">
                  <td className="border border-slate-200 px-4 py-2" colSpan={2}>
                    Tổng
                  </td>
                  {STEPS.map((step) => (
                    <td key={step.key} className="border border-slate-200 px-4 py-2 text-right">
                      {items.some((it) => it[step.key] != null) ? formatNumber(total(step.key)) : "—"}
                    </td>
                  ))}
                  <td className={cn("border border-slate-200 px-4 py-2 text-right", transitLoss > 0 && "text-red-600")}>
                    {order.status === "COMPLETED" ? formatNumber(transitLoss) : "—"}
                  </td>
                  <td className="border border-slate-200 px-4 py-2" />
                </tr>
              </tbody>
            </table>
          </CardBody>
          {(bakeryShort > 0 || transitLoss > 0) && (
            <CardBody className="flex flex-col gap-1 border-t border-slate-200 text-sm">
              {bakeryShort > 0 && <p className="text-amber-700">Tiệm bánh xác nhận thiếu {formatNumber(bakeryShort)} so với số đặt.</p>}
              {transitLoss > 0 && (
                <p className="text-red-600">
                  Hao hụt vận chuyển {formatNumber(transitLoss)}: vận chuyển lấy nhiều hơn số quán nhận. Tiệm bánh tự làm việc với người
                  vận chuyển.
                </p>
              )}
            </CardBody>
          )}
          {inputColumn && (
            <CardBody className="flex flex-wrap items-end justify-end gap-3 border-t border-slate-200">
              {showReceivedAt && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Thời gian nhận</label>
                  <Input type="datetime-local" value={effectiveReceivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
                </div>
              )}
              {editingReceived && (
                <Button variant="secondary" disabled={pending} onClick={reset}>
                  Bỏ sửa
                </Button>
              )}
              <Button disabled={pending} onClick={submitStep}>
                {pending ? "Đang lưu..." : submitLabel}
              </Button>
            </CardBody>
          )}
          {error && (
            <CardBody className="border-t border-slate-200">
              <p className="text-sm text-red-600">{error}</p>
            </CardBody>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Các bước</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3 text-sm">
            <StepLine label="Quán đặt" who={order.createdBy?.name} at={order.createdAt} />
            <StepLine label="Tiệm bánh xác nhận" who={order.confirmedBy?.name} at={order.confirmedAt} />
            <StepLine label="Vận chuyển lấy hàng" who={order.pickedUpBy?.name} at={order.pickedUpAt} />
            <StepLine label="Quán nhận hàng" who={order.receivedBy?.name} at={order.receivedAt} />
            {order.status === "CANCELLED" && <StepLine label="Huỷ / từ chối" who={order.cancelledBy?.name} at={order.cancelledAt} />}
            {order.stockImport && (
              <div className="flex flex-col gap-1">
                <span className="text-slate-500">Phiếu nhập kho tự sinh</span>
                <Link href={`/stock/imports/${order.stockImport.id}`} className="font-medium text-indigo-600 hover:underline">
                  {order.stockImport.code}
                </Link>
              </div>
            )}
            {order.note && (
              <div className="flex flex-col gap-1">
                <span className="text-slate-500">Ghi chú</span>
                <span className="text-slate-800">{order.note}</span>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StepLine({ label, who, at }: { label: string; who?: string | null; at?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={cn("font-medium", at ? "text-slate-800" : "text-slate-400")}>
        {at ? `${who ?? "—"} · ${formatDateTime(at)}` : "Chưa tới"}
      </span>
    </div>
  );
}
