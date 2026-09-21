"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ExpenseProposalItemInput } from "@/hooks/useExpenseProposals";
import { computeExpenseTotals } from "@/lib/expenseProposal";
import { formatCurrency } from "@/lib/format";
import type { ExpenseProposalItem, ExpenseProposalPendingItem } from "@/types";
import { Plus, Trash2 } from "lucide-react";

/** Một dòng đang nhập — giữ chuỗi thô để ô số không nhảy giá trị khi đang gõ dở. */
export interface ItemRow {
  /** Khoá React cục bộ — dòng không có id ổn định khi thêm/xoá giữa chừng. */
  key: number;
  content: string;
  unitPrice: string;
  unit: string;
  quantity: string;
  note: string;
}

// Bộ đếm cấp module cho khoá dòng: đọc/ghi ref trong lúc render bị React cấm.
let rowKeySeed = 0;
const newKey = () => rowKeySeed++;

export const blankRow = (): ItemRow => ({ key: newKey(), content: "", unitPrice: "", unit: "", quantity: "", note: "" });

/** Hạng mục đã lưu → dòng để sửa (dùng cho form sửa phiếu, sao chép từ dự kiến, bảng duyệt bổ sung). */
export function rowsFromItems(items: (ExpenseProposalItem | ExpenseProposalPendingItem)[] | null | undefined): ItemRow[] {
  if (!items?.length) return [blankRow()];
  return items.map((it) => ({
    key: newKey(),
    content: it.content,
    unitPrice: String(Number(it.unitPrice)),
    unit: it.unit ?? "",
    quantity: String(Number(it.quantity)),
    note: it.note ?? "",
  }));
}

const isBlankRow = (row: ItemRow) =>
  [row.content, row.unitPrice, row.unit, row.quantity, row.note].every((value) => value.trim() === "");

const toNumber = (value: string) => (value.trim() === "" ? 0 : Number(value));

export function totalsOf(rows: ItemRow[]) {
  return computeExpenseTotals(rows.map((row) => ({ unitPrice: toNumber(row.unitPrice), quantity: toNumber(row.quantity) })));
}

/**
 * Kiểm và chuyển dòng thành payload API. Dòng trống hoàn toàn bị bỏ qua; số dòng trong câu lỗi đếm
 * theo đúng vị trí người dùng nhìn thấy.
 */
export function validateRows(rows: ItemRow[]): { items: ExpenseProposalItemInput[] } | { error: string } {
  const filled = rows.map((row, index) => ({ row, stt: index + 1 })).filter(({ row }) => !isBlankRow(row));
  if (filled.length === 0) return { error: "Vui lòng nhập ít nhất 1 hạng mục." };
  for (const { row, stt } of filled) {
    if (!row.content.trim()) return { error: `Dòng ${stt}: chưa nhập nội dung.` };
    if (row.unitPrice.trim() === "" || !(Number(row.unitPrice) >= 0)) return { error: `Dòng ${stt}: đơn giá không hợp lệ.` };
    if (!(Number(row.quantity) > 0)) return { error: `Dòng ${stt}: số lượng phải lớn hơn 0.` };
  }
  return {
    items: filled.map(({ row }) => ({
      content: row.content.trim(),
      unitPrice: Number(row.unitPrice),
      unit: row.unit.trim() || undefined,
      quantity: Number(row.quantity),
      note: row.note.trim() || undefined,
    })),
  };
}

const cell = "border border-slate-200 px-2 py-1.5";
const headCell = "border border-slate-200 px-2 py-2";

interface ExpenseItemsEditorProps {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
}

/** Bảng hạng mục nhập tay: thêm/xoá dòng, thành tiền và tổng tự tính. */
export function ExpenseItemsEditor({ rows, onChange }: ExpenseItemsEditorProps) {
  const { amounts, total } = totalsOf(rows);

  function updateRow(key: number, patch: Partial<ItemRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: number) {
    if (rows.length > 1) onChange(rows.filter((row) => row.key !== key));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase text-slate-500">
              <th className={`${headCell} w-10 text-center`}>STT</th>
              <th className={headCell}>Nội dung</th>
              <th className={`${headCell} w-36`}>Đơn giá</th>
              <th className={`${headCell} w-24`}>Đơn vị</th>
              <th className={`${headCell} w-24`}>Số lượng</th>
              <th className={`${headCell} w-36 text-right`}>Thành tiền</th>
              <th className={`${headCell} w-44`}>Ghi chú</th>
              <th className={`${headCell} w-10`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td className={`${cell} text-center text-slate-500`}>{index + 1}</td>
                <td className={cell}>
                  <Input className="h-8" value={row.content} onChange={(e) => updateRow(row.key, { content: e.target.value })} />
                </td>
                <td className={cell}>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-8"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                  />
                </td>
                <td className={cell}>
                  <Input className="h-8" value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })} />
                </td>
                <td className={cell}>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="h-8"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  />
                </td>
                <td className={`${cell} text-right font-medium text-slate-700`}>{formatCurrency(amounts[index] || 0)}</td>
                <td className={cell}>
                  <Input className="h-8" value={row.note} onChange={(e) => updateRow(row.key, { note: e.target.value })} />
                </td>
                <td className={`${cell} text-center`}>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={rows.length === 1}
                    title="Xoá dòng"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className={`${cell} text-right font-medium text-slate-600`} colSpan={5}>
                Tổng
              </td>
              <td className={`${cell} text-right font-semibold text-slate-800`}>{formatCurrency(total)}</td>
              <td className={cell} colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => onChange([...rows, blankRow()])}>
        <Plus size={14} />
        Thêm dòng
      </Button>
    </div>
  );
}
