import { BakerySaleEntry } from "@/components/bakerySales/BakerySaleEntry";

export default function BakerySalesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Bánh bán ra</h1>
        <p className="text-sm text-slate-500">
          Số bánh tiệm bánh bán ra trong ngày, tách theo quán mua và phần bán ngoài. Đây là nguồn{" "}
          <strong>định mức và doanh thu</strong> của phiếu Check Cost tiệm bánh — đúng vai trò mà doanh số POS đảm nhiệm
          cho quán.
        </p>
      </div>
      <BakerySaleEntry />
    </div>
  );
}
