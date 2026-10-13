"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProducts, useSuppliers, useWarehouses } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useCreateStockImport, useUpdateStockImport, type StockImportInput } from "@/hooks/useStockImports";
import { ApiError } from "@/lib/api-client";
import { nowForDatetimeLocal, toDatetimeLocal } from "@/lib/dateRange";
import { formatCurrency } from "@/lib/format";
import type { AffectedCostCheck, StockImport } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const TYPE_OPTIONS = [
  { value: "PURCHASE", label: "Nhập mua" },
  { value: "OTHER", label: "Khác" },
];

const FORM_OPTIONS = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "BANK_TRANSFER", label: "Chuyển khoản" },
  { value: "DEBT", label: "Ghi nợ" },
  { value: "OTHER", label: "Khác" },
];

const formSchema = z.object({
  type: z.string().min(1),
  transactionAt: z.string().min(1, "Chọn thời gian nhập"),
  form: z.string().min(1),
  warehouseId: z.string().min(1, "Chọn kho hàng"),
  supplierId: z.string().min(1, "Chọn nhà cung cấp"),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "Chọn hàng hoá"),
        quantity: z.number().positive("Số lượng phải > 0"),
        costPrice: z.number().nonnegative(),
        note: z.string().optional(),
      }),
    )
    .min(1, "Cần ít nhất 1 hàng hoá"),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Form phiếu nhập kho, dùng cho cả tạo mới và sửa. Tách khỏi `StockTransactionForm` (phiếu xuất) vì
 * phiếu nhập đã khác hẳn: NCC bắt buộc trên đầu phiếu, không có khách hàng, không chọn trạng thái,
 * thời gian có giờ, và mỗi dòng có ghi chú riêng.
 */
export function StockImportForm({ existing }: { existing?: StockImport }) {
  const router = useRouter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: prices = [] } = useProductSupplierPrices();
  const createImport = useCreateStockImport();
  const updateImport = useUpdateStockImport(existing?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(existing);
  const mutation = isEdit ? updateImport : createImport;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existing
      ? {
          type: existing.type,
          // toDatetimeLocal, KHÔNG cắt chuỗi ISO: cắt chuỗi làm mốc trừ mất 7 tiếng mỗi lần lưu, và
          // đây đúng là mốc kỳ của Check Cost.
          transactionAt: toDatetimeLocal(existing.transactionAt),
          form: existing.form,
          warehouseId: existing.warehouse.id,
          supplierId: existing.supplier?.id ?? "",
          note: existing.note ?? "",
          items: existing.items.map((it) => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            costPrice: Number(it.costPrice),
            note: it.note ?? "",
          })),
        }
      : {
          type: "PURCHASE",
          transactionAt: nowForDatetimeLocal(),
          form: "CASH",
          warehouseId: "",
          supplierId: "",
          note: "",
          items: [{ productId: "", quantity: 1, costPrice: 0, note: "" }],
        },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const supplierId = watch("supplierId");
  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.costPrice) || 0), 0);

  function onSubmit(values: FormValues) {
    setError(null);
    const payload: StockImportInput = {
      ...values,
      // Chuỗi `datetime-local` không mang múi giờ, nên để server `z.coerce.date()` tự đọc là nó hiểu
      // theo giờ MÁY CHỦ (Render chạy UTC) → lệch 7 tiếng. Đổi ở trình duyệt, nơi biết giờ người dùng.
      transactionAt: new Date(values.transactionAt).toISOString(),
      items: values.items.map((it) => ({ ...it, note: it.note || undefined })),
    };

    mutation.mutate(payload as never, {
      onSuccess: (result: unknown) => {
        const affected = (result as { affectedCostChecks?: AffectedCostCheck[] }).affectedCostChecks ?? [];
        if (affected.length > 0) {
          alert(
            `Phiếu này nằm trong kỳ của ${affected.length} phiếu Check Cost đã chốt số liệu ` +
              `(${affected.map((cc) => cc.code).join(", ")}). Hãy tạo lại những phiếu đó để số liệu khớp.`,
          );
        }
        const id = (result as { id?: string }).id;
        router.replace(id ? `/stock/imports/${id}` : "/stock/imports");
      },
      onError: (err: unknown) => setError(err instanceof ApiError ? err.message : "Lưu phiếu thất bại"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{isEdit ? `Sửa phiếu nhập ${existing!.code}` : "Tạo phiếu nhập kho"}</h1>
        <p className="text-sm text-slate-500">
          Đây là nơi ghi hàng thực nhận về quán — kể cả hàng mua ngoài không qua đơn. Check Cost lấy cột &quot;Nhận trong
          kỳ&quot; từ chính các phiếu này.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Card>
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Loại phiếu</label>
              <Select {...register("type")}>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-slate-400">Hàng chuyển giữa các quán dùng Phiếu điều chuyển, đừng gõ ở đây.</p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Kho hàng</label>
              <Select {...register("warehouseId")} disabled={isEdit}>
                <option value="">Chọn kho hàng</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                    {w.shopUser ? ` — ${w.shopUser.name}` : ""}
                  </option>
                ))}
              </Select>
              {errors.warehouseId && <p className="text-xs text-red-600">{errors.warehouseId.message}</p>}
              {isEdit && <p className="text-xs text-slate-400">Không đổi được kho của phiếu đã lưu.</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Thời gian nhập</label>
              {/*
                Phải có GIỜ: mốc kỳ Check Cost (StockCheck.checkedAt) có cả giờ, nên phiếu để 00:00 sẽ
                rơi ra ngoài kỳ nếu quán kiểm đầu kỳ lúc 08:00 — sai số im lặng, không báo gì.
              */}
              <Input type="datetime-local" {...register("transactionAt")} />
              {errors.transactionAt && <p className="text-xs text-red-600">{errors.transactionAt.message}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Nhà cung cấp</label>
              <Select {...register("supplierId")}>
                <option value="">Chọn nhà cung cấp</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {errors.supplierId && <p className="text-xs text-red-600">{errors.supplierId.message}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-600">Hình thức</label>
              <Select {...register("form")}>
                {FORM_OPTIONS.map((opt) => (
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
              onClick={() => append({ productId: "", quantity: 1, costPrice: 0, note: "" })}
            >
              <Plus size={14} />
              Thêm dòng
            </Button>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {fields.map((field, index) => {
              const productRegister = register(`items.${index}.productId` as const);
              return (
                <div key={field.id} className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_120px_140px_1fr_40px]">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Hàng hoá</label>
                    <Select
                      {...productRegister}
                      onChange={(e) => {
                        productRegister.onChange(e);
                        // Tự điền giá nhập của NCC đã chọn — người dùng vẫn sửa được. NCC chưa khai
                        // giá cho hàng này thì để nguyên 0 (mặc định của dòng mới), KHÔNG đoán theo
                        // giá vốn danh mục: giá 0 là dấu "chưa có giá", đoán một con số là mất dấu đó.
                        const price = prices.find((p) => p.productId === e.target.value && p.supplierId === supplierId);
                        if (price) setValue(`items.${index}.costPrice`, Number(price.importPrice));
                      }}
                    >
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
                    <Input type="number" step="0.01" {...register(`items.${index}.quantity` as const, { valueAsNumber: true })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Giá vốn</label>
                    <Input type="number" step="0.01" {...register(`items.${index}.costPrice` as const, { valueAsNumber: true })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-500">Ghi chú dòng</label>
                    <Input {...register(`items.${index}.note` as const)} placeholder="(không bắt buộc)" />
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
              );
            })}
            {errors.items?.message && <p className="text-xs text-red-600">{errors.items.message}</p>}
            <div className="flex justify-end text-sm text-slate-600">
              Tổng tiền vốn: <span className="ml-2 font-semibold text-slate-800">{formatCurrency(total)}</span>
            </div>
          </CardBody>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Huỷ
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {isEdit ? "Lưu thay đổi" : "Tạo phiếu"}
          </Button>
        </div>
      </form>
    </div>
  );
}
