import { formatCurrency, formatNumber } from "@/lib/format";
import type { ExpenseProposalItem, ExpenseProposalPendingItem } from "@/types";

const cell = "border border-slate-200 px-3 py-2";

interface ExpenseItemsTableProps {
  items: (ExpenseProposalItem | ExpenseProposalPendingItem)[];
  total: string | number;
  totalLabel: string;
}

/** Bảng hạng mục chỉ đọc — dùng cho hạng mục dự kiến, bảng chờ duyệt bổ sung và hạng mục thực chi. */
export function ExpenseItemsTable({ items, total, totalLabel }: ExpenseItemsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs font-medium uppercase text-slate-500">
            <th className={`${cell} w-12 text-center`}>STT</th>
            <th className={cell}>Nội dung</th>
            <th className={`${cell} text-right`}>Đơn giá</th>
            <th className={cell}>Đơn vị</th>
            <th className={`${cell} text-right`}>Số lượng</th>
            <th className={`${cell} text-right`}>Thành tiền</th>
            <th className={cell}>Ghi chú</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={"id" in item ? item.id : index}>
              <td className={`${cell} text-center text-slate-500`}>{index + 1}</td>
              <td className={cell}>{item.content}</td>
              <td className={`${cell} text-right`}>{formatCurrency(item.unitPrice)}</td>
              <td className={cell}>{item.unit || "-"}</td>
              <td className={`${cell} text-right`}>{formatNumber(item.quantity)}</td>
              <td className={`${cell} text-right font-medium`}>{formatCurrency(item.amount)}</td>
              <td className={cell}>{item.note || "-"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50">
            <td className={`${cell} text-right font-medium text-slate-600`} colSpan={5}>
              {totalLabel}
            </td>
            <td className={`${cell} text-right font-semibold text-slate-800`}>{formatCurrency(total)}</td>
            <td className={cell} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
