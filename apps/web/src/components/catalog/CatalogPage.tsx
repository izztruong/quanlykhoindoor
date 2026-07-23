"use client";

import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { api, ApiError } from "@/lib/api-client";
import type { PagedResult } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

export interface CatalogFieldConfig {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea" | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface CatalogFilterConfig {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

interface CatalogPageProps<T extends { id: string }> {
  title: string;
  description: string;
  endpoint: string;
  queryKey: string;
  columns: ColumnDef<T>[];
  fields: CatalogFieldConfig[];
  toFormValues?: (item: T) => Record<string, string>;
  /** Extra header buttons rendered next to "Thêm mới" (e.g. bulk Excel import). */
  headerExtra?: React.ReactNode;
  /**
   * Controlled search text — pass this + onSearchChange when a sibling (e.g.
   * an Excel export action) needs to know the current filter too. Falls back
   * to internal state when omitted.
   */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Exact-match dropdown filters (e.g. lọc theo nhóm, theo loại) rendered next to search. */
  filters?: CatalogFilterConfig[];
}

function buildPayload(fields: CatalogFieldConfig[], values: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? "";
    if (field.type === "number") {
      payload[field.name] = raw === "" ? (field.required ? 0 : undefined) : Number(raw);
    } else if (field.type === "checkbox") {
      payload[field.name] = raw === "true";
    } else {
      payload[field.name] = raw || undefined;
    }
  }
  return payload;
}

export function CatalogPage<T extends { id: string }>({
  title,
  description,
  endpoint,
  queryKey,
  columns,
  fields,
  toFormValues,
  headerExtra,
  search: controlledSearch,
  onSearchChange,
  filters,
}: CatalogPageProps<T>) {
  const queryClient = useQueryClient();
  const [internalSearch, setInternalSearch] = useState("");
  const search = controlledSearch ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalItem, setModalItem] = useState<T | "new" | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["catalog", queryKey, search, filterValues, page, pageSize],
    queryFn: () => api.get<PagedResult<T>>(endpoint, { search, page, pageSize, ...filterValues }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["catalog", queryKey] });
    queryClient.invalidateQueries({ queryKey: [queryKey, "all"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(endpoint, payload),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu thất bại"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.put(`${endpoint}/${id}`, payload),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu thất bại"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Xoá thất bại"),
  });

  function openCreate() {
    setError(null);
    setFormValues(Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? "true" : ""])));
    setModalItem("new");
  }

  function openEdit(item: T) {
    setError(null);
    const values = toFormValues ? toFormValues(item) : (item as unknown as Record<string, string>);
    setFormValues(Object.fromEntries(fields.map((f) => [f.name, String(values[f.name] ?? "")])));
    setModalItem(item);
  }

  function closeModal() {
    setModalItem(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(fields, formValues);
    if (modalItem === "new") {
      createMutation.mutate(payload);
    } else if (modalItem) {
      updateMutation.mutate({ id: modalItem.id, payload });
    }
  }

  const tableColumns: ColumnDef<T>[] = [
    ...columns,
    {
      header: "Thao tác",
      id: "actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => openEdit(row.original)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Xoá bản ghi này?")) deleteMutation.mutate(row.original.id);
            }}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerExtra}
          <Button onClick={openCreate}>
            <Plus size={16} />
            Thêm mới
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Tìm kiếm</label>
            <Input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-64"
            />
          </div>
          {filters?.map((filter) => (
            <div key={filter.name} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">{filter.label}</label>
              <Select
                className="w-52"
                value={filterValues[filter.name] ?? ""}
                onChange={(e) => {
                  setFilterValues((prev) => ({ ...prev, [filter.name]: e.target.value }));
                  setPage(1);
                }}
              >
                <option value="">Tất cả {filter.label.toLowerCase()}</option>
                {filter.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <DataTable columns={tableColumns} data={data?.items ?? []} isLoading={isLoading} />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </CardBody>
      </Card>

      {modalItem && (
        <Modal title={modalItem === "new" ? `Thêm ${title.toLowerCase()}` : `Sửa ${title.toLowerCase()}`} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.name} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-600">{field.label}</label>
                {field.type === "select" ? (
                  <Select
                    value={formValues[field.name] ?? ""}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    required={field.required}
                  >
                    <option value="">Chọn {field.label.toLowerCase()}</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                ) : field.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={formValues[field.name] === "true"}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.checked ? "true" : "false" }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    step={field.type === "number" ? "0.01" : undefined}
                    value={formValues[field.name] ?? ""}
                    onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    required={field.required}
                  />
                )}
              </div>
            ))}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>
                Huỷ
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                Lưu
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
