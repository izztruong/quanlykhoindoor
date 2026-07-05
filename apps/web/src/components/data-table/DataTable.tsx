"use client";

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

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
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-slate-50 text-slate-600">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className="border border-slate-200 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap"
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
              <td colSpan={columnCount} className="px-3 py-8 text-center text-slate-400">
                Đang tải dữ liệu...
              </td>
            </tr>
          ) : table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border border-slate-200 px-3 py-2 text-slate-700 whitespace-nowrap">
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
