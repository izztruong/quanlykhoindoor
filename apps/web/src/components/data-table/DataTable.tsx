"use client";

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Inbox, Loader2 } from "lucide-react";

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function DataTable<T extends object>({ columns, data, isLoading, emptyMessage = "Không có dữ liệu" }: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const columnCount = table.getAllLeafColumns().length;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-slate-50/80 text-slate-600">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className="border border-slate-200 px-3 py-2.5 text-center text-[11px] font-semibold tracking-wider whitespace-nowrap text-slate-500 uppercase"
                >
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-12 text-center text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Đang tải dữ liệu...
                </span>
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-12 text-center text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                    <Inbox size={20} />
                  </span>
                  {emptyMessage}
                </div>
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition-colors even:bg-slate-50/40 hover:bg-indigo-50/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border border-slate-200 px-3 py-2.5 whitespace-nowrap text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
