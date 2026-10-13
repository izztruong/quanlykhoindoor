"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useProducts, useSuppliers, useWarehouses } from "@/hooks/useCatalog";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useBulkImportStockImports, type StockImportInput, type StockImportDuplicate } from "@/hooks/useStockImports";
import { ApiError, api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import {
  DONG_HANG_COL,
  DONG_HANG_HEADER,
  FORM_LABEL,
  PHIEU_COL,
  PHIEU_HEADER,
  SHEET,
  TYPE_LABEL,
  formatTransactionAtForExcel,
  headerMatchesDongHang,
  headerMatchesPhieu,
  parseDateTime,
  parseImportType,
  parseNumber,
  parseTransactionForm,
  wallClockToIso,
  writeWorkbook,
} from "@/lib/stockImportExcel";
import type { PagedResult, StockImport } from "@/types";
import ExcelJS from "exceljs";
import { ChevronDown, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  /** Bộ lọc đang áp trên trang danh sách — file xuất đi theo đúng bộ lọc này. */
  filter: { warehouseId?: string; from?: string; to?: string };
  scopeAll: boolean;
}

interface ImportResult {
  created: number;
  codes: string[];
  affectedCostChecks: { code: string }[];
  errors: string[];
}

export function StockImportExcelActions({ filter, scopeAll }: Props) {
  const { user: currentUser } = useCan();
  const { data: allWarehouses = [] } = useWarehouses();
  // Cùng luật với form nhập tay: phạm vi SELF chỉ nhập được vào kho của quán mình, nên mẫu Excel và
  // phần kiểm mã kho chỉ nhận kho đó — báo "mã kho không hợp lệ" ngay khi đọc file, không đợi server.
  const warehouses = useMemo(
    () => (scopeAll ? allWarehouses : allWarehouses.filter((w) => w.shopUserId === currentUser?.id)),
    [allWarehouses, scopeAll, currentUser?.id],
  );
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: prices = [] } = useProductSupplierPrices();
  const bulkImport = useBulkImportStockImports();

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Giữ dữ liệu đã đọc để bấm "Vẫn nhập" không phải chọn lại file.
  const [pending, setPending] = useState<StockImportInput[] | null>(null);
  const [duplicates, setDuplicates] = useState<StockImportDuplicate[] | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function openModal() {
    setMenuOpen(false);
    setResult(null);
    setPending(null);
    setDuplicates(null);
    setModalOpen(true);
  }

  async function handleDownloadTemplate() {
    setMenuOpen(false);
    // Dòng ví dụ dùng mã THẬT của hệ thống để người dùng biết cột mã cần gõ gì.
    const warehouseCode = warehouses.find((w) => w.shopUser)?.code ?? warehouses[0]?.code ?? "KHOQ01";
    const supplierCode = suppliers[0]?.code ?? "NCC001";
    const productCode = products[0]?.code ?? "HH001";

    await writeWorkbook(
      [
        {
          name: SHEET.phieu,
          header: PHIEU_HEADER,
          widths: [16, 14, 14, 20, 14, 16, 28],
          rows: [
            ["P1", warehouseCode, supplierCode, "15/08/2026 08:30", "Nhập mua", "Tiền mặt", ""],
            ["P2", warehouseCode, supplierCode, "15/08/2026 14:00", "", "", "Chuyến chiều"],
          ],
        },
        {
          name: SHEET.dongHang,
          header: DONG_HANG_HEADER,
          widths: [16, 18, 12, 14, 28],
          rows: [
            ["P1", productCode, 10, "", ""],
            ["P1", products[1]?.code ?? productCode, 5, 12000, "Hàng lẻ"],
            ["P2", productCode, 8, "", ""],
          ],
        },
      ],
      "mau-phieu-nhap-kho.xlsx",
    );
  }

  async function handleExport() {
    setMenuOpen(false);
    setExporting(true);
    try {
      // Xuất theo bộ lọc đang áp, không phải 20 dòng của trang đang xem.
      const data = await api.get<PagedResult<StockImport>>("/stock-imports", { ...filter, page: 1, pageSize: 500 });

      await writeWorkbook(
        [
          {
            // Mã phiếu tạm = mã phiếu THẬT, để hai sheet nối đúng nhau và nhập ngược lại được.
            name: SHEET.phieu,
            header: [...PHIEU_HEADER, "Người tạo", "Tổng tiền vốn"],
            widths: [18, 14, 14, 20, 14, 16, 28, 18, 16],
            rows: data.items.map((row) => [
              row.code,
              row.warehouse.code,
              row.supplier?.code ?? "",
              formatTransactionAtForExcel(row.transactionAt),
              TYPE_LABEL[row.type] ?? row.type,
              FORM_LABEL[row.form] ?? row.form,
              row.note ?? "",
              scopeAll ? (row.createdBy?.name ?? "") : "",
              row.items.reduce((sum, line) => sum + Number(line.costAmount), 0),
            ]),
          },
          {
            name: SHEET.dongHang,
            header: [...DONG_HANG_HEADER, "Tên hàng hoá"],
            widths: [18, 18, 12, 14, 28, 30],
            rows: data.items.flatMap((row) =>
              row.items.map((line) => [
                row.code,
                line.product.code,
                Number(line.quantity),
                Number(line.costPrice),
                line.note ?? "",
                line.product.name,
              ]),
            ),
          },
        ],
        "phieu-nhap-kho.xlsx",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Chọn lại cùng một file vẫn phải nổ event.
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setResult(null);
    setPending(null);
    setDuplicates(null);
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());

      const phieuSheet = workbook.getWorksheet(SHEET.phieu);
      const dongHangSheet = workbook.getWorksheet(SHEET.dongHang);
      if (!phieuSheet || !dongHangSheet) {
        setResult({
          created: 0,
          codes: [],
          affectedCostChecks: [],
          errors: [`Thiếu sheet: file phải có cả "${SHEET.phieu}" và "${SHEET.dongHang}". Bấm “Tải file mẫu” để lấy đúng mẫu.`],
        });
        return;
      }

      // Kiểm CẢ HAI hàng tiêu đề trước khi đọc dòng nào — lệch cột là đọc nhầm giá thành số lượng,
      // file trông vẫn bình thường mà số liệu đã hỏng.
      const phieuHeader = PHIEU_HEADER.map((_, i) => phieuSheet.getRow(1).getCell(i + 1).text);
      const dongHangHeader = DONG_HANG_HEADER.map((_, i) => dongHangSheet.getRow(1).getCell(i + 1).text);
      const headerErrors: string[] = [];
      if (!headerMatchesPhieu(phieuHeader)) {
        headerErrors.push(`Sheet "${SHEET.phieu}": tiêu đề cột không khớp mẫu. Cần đúng thứ tự: ${PHIEU_HEADER.join(", ")}.`);
      }
      if (!headerMatchesDongHang(dongHangHeader)) {
        headerErrors.push(`Sheet "${SHEET.dongHang}": tiêu đề cột không khớp mẫu. Cần đúng thứ tự: ${DONG_HANG_HEADER.join(", ")}.`);
      }
      if (headerErrors.length > 0) {
        setResult({ created: 0, codes: [], affectedCostChecks: [], errors: headerErrors });
        return;
      }

      const errors: string[] = [];
      const warehouseByCode = new Map(warehouses.map((w) => [w.code.trim().toLowerCase(), w]));
      const supplierByCode = new Map(suppliers.map((s) => [s.code.trim().toLowerCase(), s]));
      const productByCode = new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
      const priceByPair = new Map(prices.map((p) => [`${p.supplierId}|${p.productId}`, Number(p.importPrice)]));

      // ---- Sheet Phiếu ----
      interface Draft {
        tempCode: string;
        rowNumber: number;
        warehouseId: string;
        supplierId: string;
        transactionAt: string;
        type: string;
        form: string;
        note?: string;
        lines: { productId: string; quantity: number; costPrice: number; note?: string }[];
      }
      const drafts = new Map<string, Draft>();

      phieuSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const text = (col: number) => row.getCell(col).text.trim();
        const raw = (col: number) => row.getCell(col).value;

        const tempCode = text(PHIEU_COL.tempCode);
        const warehouseCode = text(PHIEU_COL.warehouseCode);
        const supplierCode = text(PHIEU_COL.supplierCode);
        const atText = text(PHIEU_COL.transactionAt);
        // Dòng trống hoàn toàn: bỏ qua im lặng.
        if (!tempCode && !warehouseCode && !supplierCode && !atText) return;

        const where = `Sheet "${SHEET.phieu}" dòng ${rowNumber}`;
        if (!tempCode) errors.push(`${where}: thiếu Mã phiếu tạm.`);
        else if (drafts.has(tempCode)) errors.push(`${where}: Mã phiếu tạm "${tempCode}" bị lặp.`);

        const warehouse = warehouseByCode.get(warehouseCode.toLowerCase());
        if (!warehouse) {
          errors.push(
            `${where}: không có kho mã "${warehouseCode}". Mã hợp lệ: ${warehouses.map((w) => w.code).join(", ") || "(chưa có kho nào)"}.`,
          );
        }

        const supplier = supplierByCode.get(supplierCode.toLowerCase());
        if (!supplier) errors.push(`${where}: không có nhà cung cấp mã "${supplierCode}".`);

        const at = parseDateTime(raw(PHIEU_COL.transactionAt), atText);
        if (!at) {
          errors.push(`${where}: Thời gian nhập phải có cả giờ, vd 15/08/2026 08:30 ("${atText}").`);
        }

        const type = parseImportType(text(PHIEU_COL.type));
        if (!type) errors.push(`${where}: Loại phiếu phải là ${Object.values(TYPE_LABEL).join(" hoặc ")} ("${text(PHIEU_COL.type)}").`);

        const form = parseTransactionForm(text(PHIEU_COL.form));
        if (!form) errors.push(`${where}: Hình thức phải là ${Object.values(FORM_LABEL).join(" / ")} ("${text(PHIEU_COL.form)}").`);

        if (!tempCode || drafts.has(tempCode) || !warehouse || !supplier || !at || !type || !form) return;
        drafts.set(tempCode, {
          tempCode,
          rowNumber,
          warehouseId: warehouse.id,
          supplierId: supplier.id,
          transactionAt: wallClockToIso(at),
          type,
          form,
          note: text(PHIEU_COL.note) || undefined,
          lines: [],
        });
      });

      // ---- Sheet Dòng hàng ----
      dongHangSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const text = (col: number) => row.getCell(col).text.trim();
        const raw = (col: number) => row.getCell(col).value;

        const tempCode = text(DONG_HANG_COL.tempCode);
        const productCode = text(DONG_HANG_COL.productCode);
        const qtyText = text(DONG_HANG_COL.quantity);
        if (!tempCode && !productCode && !qtyText) return;

        const where = `Sheet "${SHEET.dongHang}" dòng ${rowNumber}`;
        const draft = drafts.get(tempCode);
        if (!tempCode) {
          errors.push(`${where}: thiếu Mã phiếu tạm.`);
          return;
        }
        if (!draft) {
          // Có thể do chính phiếu đó đã lỗi ở sheet trên — vẫn báo để người dùng thấy dòng mồ côi.
          errors.push(`${where}: Mã phiếu tạm "${tempCode}" không có ở sheet "${SHEET.phieu}" (hoặc phiếu đó đang lỗi).`);
          return;
        }

        const product = productByCode.get(productCode.toLowerCase());
        if (!product) {
          errors.push(`${where}: không có hàng hoá mã "${productCode}".`);
          return;
        }

        const quantity = parseNumber(raw(DONG_HANG_COL.quantity), qtyText);
        if (quantity === null || quantity <= 0) {
          errors.push(`${where}: Số lượng phải là số > 0 ("${qtyText}").`);
          return;
        }

        const priceText = text(DONG_HANG_COL.costPrice);
        let costPrice: number;
        if (!priceText) {
          // Để trống thì lấy giá nhập của NCC trên đầu phiếu — giống form tạo phiếu tự điền.
          const fromPriceList = priceByPair.get(`${draft.supplierId}|${product.id}`);
          if (fromPriceList === undefined) {
            errors.push(
              `${where}: "${product.name}" chưa có giá thiết lập cho NCC của phiếu "${tempCode}", nên không bỏ trống Giá vốn được.`,
            );
            return;
          }
          costPrice = fromPriceList;
        } else {
          const parsed = parseNumber(raw(DONG_HANG_COL.costPrice), priceText);
          if (parsed === null || parsed < 0) {
            errors.push(`${where}: Giá vốn phải là số ≥ 0 ("${priceText}").`);
            return;
          }
          costPrice = parsed;
        }

        draft.lines.push({ productId: product.id, quantity, costPrice, note: text(DONG_HANG_COL.note) || undefined });
      });

      for (const draft of drafts.values()) {
        if (draft.lines.length === 0) {
          errors.push(`Sheet "${SHEET.phieu}" dòng ${draft.rowNumber}: phiếu "${draft.tempCode}" không có dòng hàng nào.`);
        }
      }

      // Một dòng lỗi là không ghi gì — nhập nửa file rồi phải tự dò xem phiếu nào đã vào còn khổ hơn.
      if (errors.length > 0) {
        setResult({ created: 0, codes: [], affectedCostChecks: [], errors });
        return;
      }
      if (drafts.size === 0) {
        setResult({ created: 0, codes: [], affectedCostChecks: [], errors: [`Sheet "${SHEET.phieu}" không có dòng dữ liệu nào.`] });
        return;
      }

      const items: StockImportInput[] = [...drafts.values()].map((d) => ({
        type: d.type,
        transactionAt: d.transactionAt,
        form: d.form,
        note: d.note,
        warehouseId: d.warehouseId,
        supplierId: d.supplierId,
        items: d.lines,
      }));

      await send(items, false);
    } catch (err) {
      setResult({
        created: 0,
        codes: [],
        affectedCostChecks: [],
        errors: [err instanceof ApiError ? err.message : "Đọc file thất bại. Vui lòng kiểm tra định dạng file."],
      });
    } finally {
      setBusy(false);
    }
  }

  async function send(items: StockImportInput[], confirmDuplicates: boolean) {
    try {
      const res = await bulkImport.mutateAsync({ items, confirmDuplicates });
      if (res.created === 0 && res.duplicates.length > 0) {
        setPending(items);
        setDuplicates(res.duplicates);
        setResult(null);
        return;
      }
      setPending(null);
      setDuplicates(null);
      setResult({ created: res.created, codes: res.codes, affectedCostChecks: res.affectedCostChecks, errors: [] });
    } catch (err) {
      setResult({
        created: 0,
        codes: [],
        affectedCostChecks: [],
        errors: [err instanceof ApiError ? err.message : "Nhập file thất bại."],
      });
    }
  }

  async function handleConfirmDuplicates() {
    if (!pending) return;
    setBusy(true);
    try {
      await send(pending, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="relative" ref={menuRef}>
        <Button variant="secondary" onClick={() => setMenuOpen((v) => !v)} disabled={exporting}>
          <FileSpreadsheet size={16} />
          {exporting ? "Đang xuất..." : "Nhập & xuất excel"}
          <ChevronDown size={14} />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button type="button" onClick={handleDownloadTemplate} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Download size={14} />
              Tải file mẫu
            </button>
            <button type="button" onClick={handleExport} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Download size={14} />
              Xuất Excel theo bộ lọc
            </button>
            <button type="button" onClick={openModal} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Upload size={14} />
              Nhập từ Excel
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal title="Nhập phiếu nhập kho từ Excel" onClose={() => setModalOpen(false)} size="lg">
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-slate-600">
              File cần hai sheet. Sheet <b>“{SHEET.phieu}”</b>: {PHIEU_HEADER.join(", ")}. Sheet{" "}
              <b>“{SHEET.dongHang}”</b>: {DONG_HANG_HEADER.join(", ")}.
            </p>
            <p className="text-slate-600">
              <b>Mã phiếu tạm</b> chỉ dùng để nối hai sheet, không lưu lại — các dòng hàng cùng một mã tạm sẽ vào cùng một phiếu.
              Thời gian nhập <b>phải có giờ</b> (vd 15/08/2026 08:30) vì đó là mốc kỳ Check Cost. Giá vốn để trống thì lấy giá
              nhập của NCC; NCC chưa khai giá cho hàng đó thì <b>phải gõ rõ giá</b> — gõ <b>0</b> nếu chưa có giá.
            </p>
            <p className="text-slate-600">
              Số thập phân dùng dấu phẩy (<b>0,5</b>); dấu chấm là dấu thập phân kiểu máy, nên <b>8.000</b> đọc thành 8 chứ
              không phải 8000 — gõ giá thì ghi thẳng <b>8000</b>.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
              Nhập Excel <b>luôn tạo phiếu mới</b>, không ghi đè phiếu cũ. Nhập lại chính file vừa xuất ra sẽ sinh phiếu
              trùng — nếu có, bạn sẽ được cảnh báo trước khi ghi.
            </p>

            <div>
              <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
                <Download size={14} />
                Tải file mẫu
              </Button>
            </div>

            <input type="file" accept=".xlsx" onChange={handleFileChange} disabled={busy} className="text-sm" />
            {busy && <p className="text-xs text-slate-400">Đang xử lý...</p>}

            {duplicates && duplicates.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-800">
                  Chưa ghi gì cả — đã có {duplicates.length} phiếu cùng kho, cùng NCC và cùng thời gian:
                </p>
                <ul className="mt-1 list-disc pl-5 text-amber-800">
                  {duplicates.slice(0, 20).map((dup) => (
                    <li key={dup.code}>
                      {dup.code} · {dup.warehouseCode} · {dup.supplierName ?? "—"} · {formatDateTime(dup.transactionAt)}
                    </li>
                  ))}
                </ul>
                {duplicates.length > 20 && <p className="mt-1 text-amber-800">… và {duplicates.length - 20} phiếu nữa.</p>}
                <div className="mt-2">
                  <Button size="sm" disabled={busy} onClick={handleConfirmDuplicates}>
                    Vẫn nhập
                  </Button>
                </div>
              </div>
            )}

            {result && result.errors.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-red-600">Chưa nhập phiếu nào — sửa {result.errors.length} lỗi sau rồi thử lại:</p>
                <ul className="mt-1 list-disc pl-5 text-red-600">
                  {result.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {result && result.created > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                <p className="font-medium">Đã tạo {result.created} phiếu nhập kho.</p>
                <p className="mt-1 text-xs">{result.codes.slice(0, 10).join(", ")}{result.codes.length > 10 ? "…" : ""}</p>
                {result.affectedCostChecks.length > 0 && (
                  <p className="mt-2">
                    Có {result.affectedCostChecks.length} phiếu Check Cost đã chốt số liệu nằm trong kỳ của các phiếu vừa nhập
                    ({result.affectedCostChecks.map((cc) => cc.code).join(", ")}). Hãy tạo lại những phiếu đó.
                  </p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
