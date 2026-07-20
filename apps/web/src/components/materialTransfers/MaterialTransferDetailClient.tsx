"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useMaterialTransfer } from "@/hooks/useMaterialTransfers";
import { formatDateTime, formatNumber } from "@/lib/format";
import Link from "next/link";

export function MaterialTransferDetailClient({ id }: { id: string }) {
  const { data: transfer, isLoading } = useMaterialTransfer(id);

  if (isLoading || !transfer) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/material-transfers" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu điều chuyển
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-slate-800">Phiếu điều chuyển {transfer.code}</h1>
        <p className="text-sm text-slate-500">
          {transfer.fromUser?.name ?? "-"} → {transfer.toUser?.name ?? "-"} · {formatDateTime(transfer.transferAt)}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Nguyên liệu điều chuyển</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase text-slate-500">
                  <th className="border border-slate-200 px-5 py-2">Tên NL</th>
                  <th className="border border-slate-200 px-5 py-2">Đơn vị</th>
                  <th className="border border-slate-200 px-5 py-2">SL chẵn</th>
                  <th className="border border-slate-200 px-5 py-2">SL lẻ</th>
                  <th className="border border-slate-200 px-5 py-2">NCC</th>
                  <th className="border border-slate-200 px-5 py-2">Giá vốn</th>
                  <th className="border border-slate-200 px-5 py-2">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(transfer.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td className="border border-slate-200 px-5 py-2">{item.product.name}</td>
                    <td className="border border-slate-200 px-5 py-2">{item.product.unit?.name}</td>
                    <td className="border border-slate-200 px-5 py-2">{item.wholeQuantity != null ? formatNumber(item.wholeQuantity) : "-"}</td>
                    <td className="border border-slate-200 px-5 py-2">
                      {item.looseQuantity != null
                        ? `${formatNumber(item.looseQuantity)}${item.product.recipeUnit?.name ? ` ${item.product.recipeUnit.name}` : ""}`
                        : "-"}
                    </td>
                    <td className="border border-slate-200 px-5 py-2">{item.supplier?.name ?? "-"}</td>
                    <td className="border border-slate-200 px-5 py-2">{item.costPrice != null ? formatNumber(item.costPrice) : "-"}</td>
                    <td className="border border-slate-200 px-5 py-2">{item.note || "-"}</td>
                  </tr>
                ))}
                {(transfer.items ?? []).length === 0 && (
                  <tr>
                    <td className="border border-slate-200 px-5 py-3 text-slate-400" colSpan={7}>
                      Không có dòng nguyên liệu nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Quán gửi</label>
              <p className="text-sm font-medium text-slate-800">{transfer.fromUser?.name ?? "-"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Quán nhận</label>
              <p className="text-sm font-medium text-slate-800">{transfer.toUser?.name ?? "-"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian điều chuyển</label>
              <p className="text-sm font-medium text-slate-800">{formatDateTime(transfer.transferAt)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <p className="text-sm text-slate-800">{transfer.note || "-"}</p>
            </div>
            {transfer.createdBy && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Người tạo</label>
                <p className="text-sm text-slate-800">{transfer.createdBy.name}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
