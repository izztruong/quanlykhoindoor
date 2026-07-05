"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useCustomers, useProducts, useSuppliers, useWarehouses } from "@/hooks/useCatalog";
import type { StockTransactionInput } from "@/hooks/useStockTransactions";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import type { StockTransaction } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import type { UseMutationResult } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  type: z.string().min(1),
  transactionAt: z.string().min(1),
  form: z.string().min(1),
  status: z.string().min(1),
  warehouseId: z.string().min(1, "Chọn kho hàng"),
  supplierId: z.string().optional(),
  customerId: z.string().optional(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Chọn hàng hoá"),
        quantity: z.number().positive("Số lượng phải > 0"),
        costPrice: z.number().nonnegative(),
      }),
    )
    .min(1, "Cần ít nhất 1 hàng hoá"),
});

type FormValues = z.infer<typeof formSchema>;

interface StockTransactionFormProps {
  title: string;
  description: string;
  typeOptions: { value: string; label: string }[];
  useCreate: () => UseMutationResult<StockTransaction, unknown, StockTransactionInput>;
  redirectBase: string;
}

const formOptions = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "DEBT", label: "Công nợ" },
  { value: "OTHER", label: "Khác" },
];

const statusOptions = [
  { value: "COMPLETED", label: "Hoàn thành" },
  { value: "DRAFT", label: "Nháp" },
  { value: "CANCELLED", label: "Đã huỷ" },
];

export function StockTransactionForm({ title, description, typeOptions, useCreate, redirectBase }: StockTransactionFormProps) {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: suppliers = [] } = useSuppliers();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const createTransaction = useCreate();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: typeOptions[0]?.value ?? "",
      transactionAt: new Date().toISOString().slice(0, 10),
      form: "CASH",
      status: "COMPLETED",
      warehouseId: "",
      supplierId: "",
      customerId: "",
      note: "",
      items: [{ productId: "", quantity: 1, costPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.costPrice) || 0), 0);

  function onSubmit(values: FormValues) {
    setError(null);
    createTransaction.mutate(
      {
        ...values,
        supplierId: values.supplierId || undefined,
        customerId: values.customerId || undefined,
      },
      {
        onSuccess: () => router.replace(redirectBase),
        onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu phiếu thất bại"),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Card>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Loại phiếu</label>
              <Select {...register("type")}>
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Kho hàng</label>
              <Select {...register("warehouseId")}>
                <option value="">Chọn kho hàng</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              {errors.warehouseId && <p className="text-xs text-red-600">{errors.warehouseId.message}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian</label>
              <Input type="date" {...register("transactionAt")} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Nhà cung cấp</label>
              <Select {...register("supplierId")}>
                <option value="">Không có</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Khách hàng</label>
              <Select {...register("customerId")}>
                <option value="">Không có</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Hình thức</label>
              <Select {...register("form")}>
                {formOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Trạng thái</label>
              <Select {...register("status")}>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1 md:col-span-3">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <Input {...register("note")} placeholder="Ghi chú (không bắt buộc)" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá</CardTitle>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ productId: "", quantity: 1, costPrice: 0 })}
            >
              <Plus size={14} />
              Thêm dòng
            </Button>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_140px_160px_40px]">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Hàng hoá</label>
                  <Select {...register(`items.${index}.productId` as const)}>
                    <option value="">Chọn hàng hoá</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatCurrency(p.costPrice)})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Số lượng</label>
                  <Input type="number" step="0.01" {...register(`items.${index}.quantity` as const, { valueAsNumber: true })} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Giá vốn</label>
                  <Input type="number" step="0.01" {...register(`items.${index}.costPrice` as const, { valueAsNumber: true })} />
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {errors.items?.message && <p className="text-xs text-red-600">{errors.items.message}</p>}

            <div className="flex justify-end border-t border-slate-100 pt-3 text-sm font-semibold text-slate-700">
              Tổng tiền vốn: {formatCurrency(total)}
            </div>
          </CardBody>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={createTransaction.isPending}>
            {createTransaction.isPending ? "Đang lưu..." : "Lưu phiếu"}
          </Button>
        </div>
      </form>
    </div>
  );
}
