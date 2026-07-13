"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useProducts, useProductStock, useWarehouses } from "@/hooks/useCatalog";
import { useCreateSalesOrder } from "@/hooks/useSalesOrders";
import { ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/lib/auth";
import { type ExcelColumn, exportRowsToExcel } from "@/lib/excelExport";
import { formatNumber } from "@/lib/format";
import { zodResolver } from "@hookform/resolvers/zod";
import ExcelJS from "exceljs";
import { ChevronDown, Download, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  warehouseId: z.string().min(1, "Chọn kho hàng"),
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
      note: "",
      items: [{ productId: "", quantity: 1 }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const warehouseId = watch("warehouseId");

  const { data: stockLevels = [] } = useProductStock(warehouseId);
  const stockByProductId = useMemo(() => new Map(stockLevels.map((s) => [s.productId, s.quantity])), [stockLevels]);

  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const excelMenuRef = useRef<HTMLDivElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ updated: number; errors: string[] } | null>(null);

  useEffect(() => {
    if (!excelMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (excelMenuRef.current && !excelMenuRef.current.contains(e.target as Node)) setExcelMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [excelMenuOpen]);

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Đơn hàng");
    sheet.columns = ["Tên hàng hoá*", "Số lượng*"].map((header) => ({ header, width: 28 }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([products[0]?.name ?? "Tên hàng hoá mẫu", 1]);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-tao-don-hang.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setImportResult({ updated: 0, errors: ["Không đọc được sheet nào trong file."] });
        return;
      }

      const productByName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
      const errors: string[] = [];
      const rows: { productId: string; quantity: number }[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = String(row.getCell(1).value ?? "").trim();
        const qtyRaw = row.getCell(2).value;
        if (!name) return;

        const product = productByName.get(name.toLowerCase());
        if (!product) {
          errors.push(`Dòng ${rowNumber}: không tìm thấy hàng hoá "${name}"`);
          return;
        }

        const quantity = Number(qtyRaw);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          errors.push(`Dòng ${rowNumber}: số lượng không hợp lệ`);
          return;
        }

        rows.push({ productId: product.id, quantity });
      });

      if (rows.length > 0) replace(rows);
      setImportResult({ updated: rows.length, errors });
    } catch {
      setImportResult({ updated: 0, errors: ["Đọc file thất bại. Vui lòng kiểm tra định dạng file."] });
    } finally {
      setImporting(false);
    }
  }

  async function exportData() {
    setExcelMenuOpen(false);
    const rows = items.filter((it) => it.productId);
    const columns: ExcelColumn<FormValues["items"][number]>[] = [
      { header: "Tên hàng hoá", value: (it) => products.find((p) => p.id === it.productId)?.name ?? "-" },
      { header: "Số lượng", value: (it) => it.quantity },
      { header: "ĐVT", value: (it) => productUnitLabel(it.productId) },
    ];
    await exportRowsToExcel("Đơn hàng", columns, rows, "don-hang.xlsx");
  }

  function productUnitLabel(productId: string) {
    return products.find((p) => p.id === productId)?.unit?.name ?? "-";
  }

  function stockExceededMessage(productId: string, quantity: number): string | null {
    if (!warehouseId || !productId || !quantity) return null;
    const available = stockByProductId.get(productId) ?? 0;
    if (quantity > available) return `Còn ${formatNumber(available)}`;
    return null;
  }

  function onSubmit(values: FormValues) {
    setError(null);

    const exceeded = values.items.find((it) => stockExceededMessage(it.productId, it.quantity));
    if (exceeded) {
      setError("Có hàng hoá vượt quá số lượng tồn kho, vui lòng kiểm tra lại.");
      return;
    }

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
          <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm font-medium text-slate-600">Ghi chú</label>
              <Input {...register("note")} placeholder="Ghi chú đơn hàng (không bắt buộc)" />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hàng hoá</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative" ref={excelMenuRef}>
                <Button type="button" variant="secondary" size="sm" onClick={() => setExcelMenuOpen((o) => !o)}>
                  Nhập & xuất excel
                  <ChevronDown size={14} />
                </Button>
                {excelMenuOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setExcelMenuOpen(false);
                        setImportResult(null);
                        setImportOpen(true);
                      }}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Nhập dữ liệu
                    </button>
                    <button type="button" onClick={exportData} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                      Xuất dữ liệu
                    </button>
                  </div>
                )}
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => append({ productId: "", quantity: 1 })}>
                <Plus size={14} />
                Thêm dòng
              </Button>
            </div>
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
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-slate-500">Số lượng</label>
                    {(() => {
                      const productId = items[index]?.productId;
                      const quantity = items[index]?.quantity;
                      const exceededMessage = stockExceededMessage(productId, quantity);
                      if (exceededMessage) return <span className="text-xs font-medium text-red-600">{exceededMessage}</span>;
                      if (warehouseId && productId) {
                        return <span className="text-xs text-slate-400">Tồn kho: {formatNumber(stockByProductId.get(productId) ?? 0)}</span>;
                      }
                      return null;
                    })()}
                  </div>
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

      {importOpen && (
        <Modal title="Nhập hàng hoá từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: Tên hàng hoá*, Số lượng* (cột có dấu * là bắt buộc phải
              điền). Dữ liệu nhập vào sẽ thay thế toàn bộ danh sách hàng hoá hiện có trên form.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing} />
            {importing && <p className="text-sm text-slate-400">Đang xử lý...</p>}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-700">Đã nhập {importResult.updated} hàng hoá vào đơn.</p>
                {importResult.errors.length > 0 && (
                  <div>
                    <p className="font-medium text-red-600">Bỏ qua {importResult.errors.length} dòng lỗi:</p>
                    <ul className="mt-1 list-disc pl-5 text-red-600">
                      {importResult.errors.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
