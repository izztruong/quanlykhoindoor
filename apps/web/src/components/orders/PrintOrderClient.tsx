"use client";

import { useSalesOrder } from "@/hooks/useSalesOrders";
import { formatDateVN, labels } from "@/lib/format";
import Link from "next/link";

const today = new Date();

export function PrintOrderClient({ id }: { id: string }) {
  const { data: order, isLoading, isError } = useSalesOrder(id);

  if (isLoading) {
    return <p className="p-6 text-slate-400">Đang tải...</p>;
  }

  if (isError || !order) {
    return <p className="p-6 text-red-600">Không tải được đơn hàng. Vui lòng đăng nhập lại và thử lại.</p>;
  }

  const totalQty = order.items.reduce((sum, it) => sum + Number(it.quantity), 0);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-sm text-black print:p-0">
      <style>{`@page { size: A4; margin: 15mm; }`}</style>

      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <Link href={`/orders/${id}`} className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">
          Đóng
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
        >
          In hoá đơn
        </button>
      </div>

      <h1 className="text-center text-2xl font-bold uppercase tracking-wide">Phiếu bán hàng</h1>
      <div className="mt-1 text-right">
        <div>
          Số phiếu: <span className="font-bold">{order.code}</span>
        </div>
        <div>Ngày tạo: {formatDateVN(order.createdAt)}</div>
        <div>
          Trạng thái: <span className="font-bold">{labels.salesOrderStatus(order.status)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
        <div>
          Tài khoản: <span className="font-bold">{order.createdBy?.name ?? "-"}</span>
        </div>
        <div>Kho xuất: {order.warehouse.code} - {order.warehouse.name}</div>
        <div>Email: {order.createdBy?.email ?? "-"}</div>
        <div>Đ/C kho xuất: {order.warehouse.address || "-"}</div>
        <div>T/G xuất: {order.stockExport ? formatDateVN(order.stockExport.transactionAt) : "-"}</div>
        <div>Tham chiếu: -</div>
        <div>Ghi chú: {order.note || "-"}</div>
      </div>

      <table className="mt-4 w-full border-collapse border border-black text-xs">
        <thead>
          <tr>
            {["#", "Mã hàng", "Tên hàng", "Ghi chú", "NVL", "ĐVT", "Số lượng", "Đơn giá", "Giảm giá", "Vat", "Tiền Vat", "Thành tiền"].map(
              (h) => (
                <th key={h} className="border border-black px-1.5 py-1 text-center">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={item.id}>
              <td className="border border-black px-1.5 py-1 text-center">{index + 1}</td>
              <td className="border border-black px-1.5 py-1">{item.product.code}</td>
              <td className="border border-black px-1.5 py-1">{item.product.name}</td>
              <td className="border border-black px-1.5 py-1">-</td>
              <td className="border border-black px-1.5 py-1 text-center">-</td>
              <td className="border border-black px-1.5 py-1 text-center">{item.product.unit?.name ?? "-"}</td>
              <td className="border border-black px-1.5 py-1 text-center">{item.quantity}</td>
              <td className="border border-black px-1.5 py-1 text-right">0</td>
              <td className="border border-black px-1.5 py-1 text-right">0</td>
              <td className="border border-black px-1.5 py-1 text-center">0%</td>
              <td className="border border-black px-1.5 py-1 text-right">0</td>
              <td className="border border-black px-1.5 py-1 text-right">0</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="border border-black px-1.5 py-1" colSpan={6}>
              Tổng cộng
            </td>
            <td className="border border-black px-1.5 py-1 text-center">{totalQty}</td>
            <td className="border border-black px-1.5 py-1 text-right">0</td>
            <td className="border border-black px-1.5 py-1 text-right">0</td>
            <td className="border border-black px-1.5 py-1"></td>
            <td className="border border-black px-1.5 py-1 text-right">0</td>
            <td className="border border-black px-1.5 py-1 text-right">0</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-2 flex justify-between">
        <span>Chiết khấu giảm giá</span>
        <span>0</span>
      </div>
      <div className="flex justify-between">
        <span>Tiền thuế GTGT</span>
        <span>0</span>
      </div>
      <div className="flex justify-between font-bold">
        <span>Tổng tiền</span>
        <span>0</span>
      </div>

      <div className="mt-2">
        Tổng tiền thanh toán bằng chữ: <span className="font-bold">Không đồng</span>
      </div>

      <div className="mt-8 text-right">
        Ngày {today.getDate()} Tháng {today.getMonth() + 1} Năm {today.getFullYear()}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-4 text-center">
        {["Người lập", "Người giao", "Người nhận"].map((label) => (
          <div key={label}>
            <div className="font-semibold">{label}</div>
            <div className="text-xs italic text-slate-500">(Ký, họ tên)</div>
          </div>
        ))}
      </div>
    </div>
  );
}
