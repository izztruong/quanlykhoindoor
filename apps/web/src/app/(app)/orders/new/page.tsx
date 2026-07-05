"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProducts, useWarehouses } from "@/hooks/useCatalog";
import { useCreateSalesOrder } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  warehouseId: z.string().min(1, "Chọn kho hàng"),
  orderDate: z.string().min(1),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Chọn hàng hoá"),
        quantity: z.number().int("Số lượng phải là số nguyên").positive("Số lượng phải > 0"),
      }),
    )
    .min(1, "Cần ít nhất 1 hàng hoá"),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewOrderPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data: warehouses = [] } = useWarehouses();
  const { data: products = [] } = useProducts();
  const createOrder = useCreateSalesOrder();
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
      warehouseId: "",
      orderDate: new Date().toISOString().slice(0, 10),
      note: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");

  function productUnitLabel(productId: string) {
    return products.find((p) => p.id === productId)?.unit?.name ?? "-";
  }

  function onSubmit(values: FormValues) {
    setError(null);
    createOrder.mutate(values, {
      onSuccess: (order) => router.replace(`/orders/${order.id}`),
      onError: (err) => setError(err instanceof ApiError ? err.message : "Tạo đơn hàng thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Tạo đơn hàng</h1>
        <p className="text-sm text-slate-500">Đơn hàng nội bộ, gắn với tài khoản của bạn.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Card>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Tài khoản</label>
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {currentUser?.name ?? "-"}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Kho xuất</label>
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
              <label className="text-sm font-medium text-slate-600">Ngày đặt</label>
              <Input type="date" {...register("orderDate")} />
            </div>

            <div className="flex flex-col gap-1 md:col-span-3">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <Input {...register("note")} placeholder="Ghi chú đơn hàng (không bắt buộc)" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={() => append({ productId: "", quantity: 1 })}>
              <Plus size={14} />
              Thêm dòng
            </Button>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_140px_120px_40px]">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Hàng hoá</label>
                  <Select {...register(`items.${index}.productId` as const)}>
                    <option value="">Chọn hàng hoá</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Số lượng</label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Đơn vị</label>
                  <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                    {productUnitLabel(items[index]?.productId)}
                  </div>
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
          </CardBody>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? "Đang lưu..." : "Tạo đơn hàng"}
          </Button>
        </div>
      </form>
    </div>
  );
}
