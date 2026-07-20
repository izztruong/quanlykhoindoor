"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useMaterialWaste } from "@/hooks/useMaterialWaste";
import { formatDateTime, formatNumber } from "@/lib/format";
import Link from "next/link";

export function MaterialWasteDetailClient({ id }: { id: string }) {
  const { data: waste, isLoading } = useMaterialWaste(id);

  if (isLoading || !waste) {
    return <p className="text-slate-400">Đang tải...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/material-waste" className="self-start text-sm text-indigo-600 hover:underline">
        ← Danh sách phiếu huỷ
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-slate-800">Phiếu huỷ {waste.code}</h1>
        <p className="text-sm text-slate-500">Thời gian huỷ: {formatDateTime(waste.wasteAt)}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Nguyên liệu huỷ</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className="border border-slate-200 px-5 py-2">Tên NL</th>
                    <th className="border border-slate-200 px-5 py-2">Đơn vị</th>
                    <th className="border border-slate-200 px-5 py-2">SL chẵn</th>
                    <th className="border border-slate-200 px-5 py-2">SL lẻ</th>
                    <th className="border border-slate-200 px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(waste.items ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-5 py-2">{item.product.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.product.unit?.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.wholeQuantity != null ? formatNumber(item.wholeQuantity) : "-"}</td>
                      <td className="border border-slate-200 px-5 py-2">
                        {item.looseQuantity != null
                          ? `${formatNumber(item.looseQuantity)}${item.product.recipeUnit?.name ? ` ${item.product.recipeUnit.name}` : ""}`
                          : "-"}
                      </td>
                      <td className="border border-slate-200 px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(waste.items ?? []).length === 0 && (
                    <tr>
                      <td className="border border-slate-200 px-5 py-3 text-slate-400" colSpan={5}>
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
              <CardTitle>Đồ thành phẩm huỷ</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto p-0">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase text-slate-500">
                    <th className="border border-slate-200 px-5 py-2">Tên đồ thành phẩm</th>
                    <th className="border border-slate-200 px-5 py-2">Đơn vị</th>
                    <th className="border border-slate-200 px-5 py-2">Số lượng</th>
                    <th className="border border-slate-200 px-5 py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {(waste.finishedItems ?? []).map((item) => (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-5 py-2">{item.finishedGoodItem.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.finishedGoodItem.unit?.name}</td>
                      <td className="border border-slate-200 px-5 py-2">{formatNumber(item.quantity)}</td>
                      <td className="border border-slate-200 px-5 py-2">{item.note || "-"}</td>
                    </tr>
                  ))}
                  {(waste.finishedItems ?? []).length === 0 && (
                    <tr>
                      <td className="border border-slate-200 px-5 py-3 text-slate-400" colSpan={4}>
                        Không có dòng đồ thành phẩm nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian huỷ</label>
              <p className="text-sm font-medium text-slate-800">{formatDateTime(waste.wasteAt)}</p>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <p className="text-sm text-slate-800">{waste.note || "-"}</p>
            </div>
            {waste.createdBy && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">Người tạo</label>
                <p className="text-sm text-slate-800">{waste.createdBy.name}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
