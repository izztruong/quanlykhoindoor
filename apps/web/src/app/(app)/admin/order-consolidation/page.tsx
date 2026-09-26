"use client";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useOrderConsolidation } from "@/hooks/useOrderConsolidation";
import { WEEKDAYS } from "@/lib/deadlines";
import { formatCurrency } from "@/lib/format";
import { PackageCheck, Truck } from "lucide-react";

const cellClass = "border border-slate-200 px-3 py-2 align-top";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

function weekdayLabel(weekday: number): string {
  return WEEKDAYS.find((d) => d.value === weekday)?.label ?? `thứ ${weekday}`;
}

export default function OrderConsolidationPage() {
  const { data, isLoading, isError } = useOrderConsolidation();
  const suppliers = data?.suppliers ?? [];
  const toConsolidate = suppliers.filter((s) => s.shouldConsolidate);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Gom đơn &amp; miễn ship</h1>
        <p className="text-sm text-slate-500">
          Phí ship tính theo <strong>từng quán</strong>, nên ba quán đặt lẻ cùng một NCC là ba lần ship. Khi tổng cả chuỗi
          đã vượt ngưỡng miễn ship mà từng quán chưa đủ, dồn về một quán rồi chuyển đi vào ngày chuyển miễn phí sẽ chỉ
          mất một lần ship. Chỉ tính hàng <strong>không có công nợ</strong> — hàng công nợ trả sau 2 tháng nên không chịu
          sức ép tiền mặt, không đáng kéo thêm rủi ro vận chuyển.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Số liệu lấy từ đơn đang <strong>Nháp</strong> và <strong>Chờ xác nhận</strong> — phần còn phải đi đặt.
        </p>
      </div>

      {data && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Truck className="h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Ngày chuyển hàng miễn phí gần nhất: <strong>{weekdayLabel(data.nextTransferWeekday)}</strong>
            {data.nextTransferDaysAway === 0 ? " — chính là hôm nay" : `, còn ${data.nextTransferDaysAway} ngày`}
          </span>
        </div>
      )}

      {toConsolidate.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <PackageCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Gom được {toConsolidate.length} NCC</strong>, tiết kiệm{" "}
            {toConsolidate.reduce((sum, s) => sum + s.shipmentsSaved, 0)} lần ship:{" "}
            {toConsolidate.map((s) => `${s.supplierName} → ${s.consolidateIntoUserName}`).join(" · ")}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Đang tính…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">Không tải được số liệu.</p>
      ) : suppliers.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              Không có đơn Nháp / Chờ xác nhận nào chứa hàng không công nợ. Nếu bạn vừa tạo đơn mà đây vẫn trống, kiểm tra
              cột <strong>Công nợ</strong> ở Quản trị › Giá theo Nhà cung cấp — hàng đã tick công nợ cố ý không tính vào đây.
            </p>
          </CardBody>
        </Card>
      ) : (
        suppliers.map((supplier) => (
          <Card key={supplier.supplierId}>
            <CardHeader>
              <CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{supplier.supplierName}</span>
                  {supplier.freeShipThreshold == null ? (
                    <Badge tone="gray">chưa khai ngưỡng miễn ship</Badge>
                  ) : supplier.shouldConsolidate ? (
                    <Badge tone="green">gom được — tiết kiệm {supplier.shipmentsSaved} lần ship</Badge>
                  ) : supplier.shops.every((s) => s.reachesThreshold) ? (
                    <Badge tone="blue">mọi quán đã miễn ship</Badge>
                  ) : (
                    <Badge tone="yellow">chưa gom được</Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Quán</th>
                    <th className={headClass}>Tiền hàng không công nợ</th>
                    <th className={headClass}>Còn thiếu để miễn ship</th>
                    <th className={headClass}>Đơn góp vào</th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.shops.map((shop) => (
                    <tr
                      key={shop.userId}
                      className={shop.userId === supplier.consolidateIntoUserId ? "bg-emerald-50" : undefined}
                    >
                      <td className={cellClass}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{shop.userName}</span>
                          {shop.userId === supplier.consolidateIntoUserId && <Badge tone="green">gom về đây</Badge>}
                        </div>
                      </td>
                      <td className={cellClass}>{formatCurrency(shop.amount)}</td>
                      <td className={cellClass}>
                        {shop.reachesThreshold ? (
                          <span className="text-emerald-700">đã đủ</span>
                        ) : (
                          <span className="text-amber-700">{formatCurrency(shop.shortfall)}</span>
                        )}
                      </td>
                      <td className={cellClass}>{shop.orderCodes.join(", ")}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className={cellClass}>Tổng cả chuỗi</td>
                    <td className={cellClass}>{formatCurrency(supplier.totalAmount)}</td>
                    <td className={cellClass} colSpan={2}>
                      {supplier.freeShipThreshold == null
                        ? "—"
                        : `ngưỡng ${formatCurrency(supplier.freeShipThreshold)} / quán`}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div>
                <p className="mb-1 text-xs font-medium uppercase text-slate-500">Vì sao kết luận như vậy</p>
                <ul className="list-inside list-disc text-sm text-slate-600">
                  {supplier.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}
