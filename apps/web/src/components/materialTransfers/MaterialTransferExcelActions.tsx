"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useProducts, useSuppliers } from "@/hooks/useCatalog";
import {
  useBulkImportMaterialTransfers,
  type MaterialTransferCreateInput,
  type MaterialTransferDuplicate,
} from "@/hooks/useMaterialTransfers";
import { useProductSupplierPrices } from "@/hooks/useProductSupplierPrices";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import {
  DONG_HANG_COL,
  DONG_HANG_HEADER,
  PHIEU_COL,
  PHIEU_HEADER,
  SHEET,
  headerMatchesDongHang,
  headerMatchesPhieu,
  matchShopByName,
  parseDateTime,
  parseNumber,
  wallClockToIso,
  writeWorkbook,
} from "@/lib/materialTransferExcel";
import ExcelJS from "exceljs";
import { ChevronDown, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ImportResult {
  created: number;
  codes: string[];
  affectedCostChecks: { code: string }[];
  errors: string[];
}

/**
 * Nhập nhiều phiếu điều chuyển từ một file Excel. **Chưa có Xuất Excel**: file bỏ cột SL lẻ, và web
 * nạp thẳng lượng đã trừ vỏ vào form sửa nên xuất ra rồi nhập lại sẽ trừ vỏ lần hai.
 */
export function MaterialTransferExcelActions() {
  const { data: shops = [] } = useUserOptions();
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: prices = [] } = useProductSupplierPrices();
  const bulkImport = useBulkImportMaterialTransfers();

  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  // Giữ dữ liệu đã đọc để bấm "Vẫn nhập" không phải chọn lại file.
  const [pending, setPending] = useState<MaterialTransferCreateInput[] | null>(null);
  const [duplicates, setDuplicates] = useState<MaterialTransferDuplicate[] | null>(null);
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
    // Dòng ví dụ dùng tên quán và mã hàng hoá THẬT để người dùng biết cột đó cần gõ gì.
    const fromShop = shops[0]?.name ?? "Quán A";
    const toShop = shops[1]?.name ?? "Quán B";
    const firstProduct = products[0];
    const secondProduct = products[1] ?? firstProduct;
    const productCode = firstProduct?.code ?? "HH001";

    await writeWorkbook(
      [
        {
          name: SHEET.phieu,
          header: PHIEU_HEADER,
          widths: [16, 22, 22, 20, 28],
          rows: [
            ["P1", fromShop, toShop, "15/08/2026 08:30", ""],
            ["P2", toShop, fromShop, "15/08/2026 14:00", "Chuyển bù buổi chiều"],
          ],
        },
        {
          // Hai cột cuối CHỈ để tham khảo, phần nhập bỏ qua: bảng điều chuyển trên web không có cột
          // đơn vị nên người gõ file không có chỗ nào tra ra "SL chẵn" đang tính theo đơn vị gì.
          name: SHEET.dongHang,
          header: [...DONG_HANG_HEADER, "Tên hàng hoá (tham khảo)", "Đơn vị (tham khảo)"],
          widths: [16, 18, 26, 14, 14, 28, 30, 16],
          rows: [
            ["P1", productCode, 3, "", "", "", firstProduct?.name ?? "", firstProduct?.unit?.name ?? ""],
            ["P1", secondProduct?.code ?? productCode, 1.5, "", "", "Hàng lẻ", secondProduct?.name ?? "", secondProduct?.unit?.name ?? ""],
            ["P2", productCode, 2, "", "", "", firstProduct?.name ?? "", firstProduct?.unit?.name ?? ""],
          ],
        },
      ],
      "mau-phieu-dieu-chuyen.xlsx",
    );
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
      const supplierByCode = new Map(suppliers.map((s) => [s.code.trim().toLowerCase(), s]));
      const productByCode = new Map(products.map((p) => [p.code.trim().toLowerCase(), p]));
      // GIÁ XUẤT, không phải giá nhập — form điều chuyển tự điền giá xuất của NCC.
      const priceByPair = new Map(prices.map((p) => [`${p.supplierId}|${p.productId}`, Number(p.exportPrice)]));

      /** Ba kết quả của `matchShopByName` thành ba câu lỗi riêng, không đoán bừa quán nào. */
      function readShop(label: string, where: string, text: string): string | null {
        const match = matchShopByName(text, shops);
        if (match === "empty") {
          errors.push(`${where}: thiếu ${label}.`);
          return null;
        }
        if (match === "not-found") {
          errors.push(
            `${where}: không có quán tên "${text}" (${label}). Tên hợp lệ: ${shops.map((s) => s.name).join(", ") || "(chưa có quán nào)"}.`,
          );
          return null;
        }
        if (match === "ambiguous") {
          errors.push(`${where}: có nhiều quán cùng tên "${text}" (${label}), không xác định được quán nào.`);
          return null;
        }
        return match.id;
      }

      // ---- Sheet Phiếu ----
      interface Draft {
        tempCode: string;
        rowNumber: number;
        fromUserId: string;
        toUserId: string;
        transferAt: string;
        note?: string;
        lines: { productId: string; wholeQuantity: number; supplierId?: string; costPrice?: number; note?: string }[];
      }
      const drafts = new Map<string, Draft>();

      phieuSheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const text = (col: number) => row.getCell(col).text.trim();
        const raw = (col: number) => row.getCell(col).value;

        const tempCode = text(PHIEU_COL.tempCode);
        const fromText = text(PHIEU_COL.fromShop);
        const toText = text(PHIEU_COL.toShop);
        const atText = text(PHIEU_COL.transferAt);
        // Dòng trống hoàn toàn: bỏ qua im lặng.
        if (!tempCode && !fromText && !toText && !atText) return;

        const where = `Sheet "${SHEET.phieu}" dòng ${rowNumber}`;
        if (!tempCode) errors.push(`${where}: thiếu Mã phiếu tạm.`);
        else if (drafts.has(tempCode)) errors.push(`${where}: Mã phiếu tạm "${tempCode}" bị lặp.`);

        const fromUserId = readShop("Quán gửi", where, fromText);
        const toUserId = readShop("Quán nhận", where, toText);
        if (fromUserId && toUserId && fromUserId === toUserId) {
          errors.push(`${where}: Quán gửi và Quán nhận phải khác nhau ("${fromText}").`);
        }

        // Cột này BẮT BUỘC dù API có mặc định `now()`: để trống thì cả file đổ về giờ nhập, sai kỳ
        // Check Cost mà không báo gì.
        const at = parseDateTime(raw(PHIEU_COL.transferAt), atText);
        if (!at) errors.push(`${where}: Thời gian chuyển phải có cả giờ, vd 15/08/2026 08:30 ("${atText}").`);

        if (!tempCode || drafts.has(tempCode) || !fromUserId || !toUserId || fromUserId === toUserId || !at) return;
        drafts.set(tempCode, {
          tempCode,
          rowNumber,
          fromUserId,
          toUserId,
          transferAt: wallClockToIso(at),
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
        const qtyText = text(DONG_HANG_COL.wholeQuantity);
        if (!tempCode && !productCode && !qtyText) return;

        const where = `Sheet "${SHEET.dongHang}" dòng ${rowNumber}`;
        if (!tempCode) {
          errors.push(`${where}: thiếu Mã phiếu tạm.`);
          return;
        }
        const draft = drafts.get(tempCode);
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

        // File không có cột SL lẻ, nên dòng thiếu SL chẵn là dòng vô nghĩa — đừng để nó lọt thành
        // một dòng rỗng trong phiếu.
        const wholeQuantity = parseNumber(raw(DONG_HANG_COL.wholeQuantity), qtyText);
        if (wholeQuantity === null || wholeQuantity <= 0) {
          errors.push(`${where}: SL chẵn phải là số > 0, theo đơn vị ${product.unit?.name ?? "chính"} ("${qtyText}").`);
          return;
        }

        const supplierCode = text(DONG_HANG_COL.supplierCode);
        let supplierId: string | undefined;
        if (supplierCode) {
          const supplier = supplierByCode.get(supplierCode.toLowerCase());
          if (!supplier) {
            errors.push(`${where}: không có nhà cung cấp mã "${supplierCode}".`);
            return;
          }
          supplierId = supplier.id;
        }

        const priceText = text(DONG_HANG_COL.costPrice);
        let costPrice: number | undefined;
        if (priceText) {
          const parsed = parseNumber(raw(DONG_HANG_COL.costPrice), priceText);
          if (parsed === null || parsed < 0) {
            errors.push(`${where}: Giá vốn phải là số ≥ 0 ("${priceText}").`);
            return;
          }
          costPrice = parsed;
        } else if (supplierId) {
          // Có NCC mà trống giá thì lấy GIÁ XUẤT của NCC đó, giống form tạo phiếu tự điền. Không có
          // NCC thì để trống luôn — khác phiếu nhập kho, ở đây NCC và giá đều tuỳ chọn.
          const fromPriceList = priceByPair.get(`${supplierId}|${product.id}`);
          if (fromPriceList === undefined) {
            errors.push(`${where}: "${product.name}" chưa có giá xuất cho NCC "${supplierCode}", nên không bỏ trống Giá vốn được.`);
            return;
          }
          costPrice = fromPriceList;
        }

        draft.lines.push({ productId: product.id, wholeQuantity, supplierId, costPrice, note: text(DONG_HANG_COL.note) || undefined });
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

      const items: MaterialTransferCreateInput[] = [...drafts.values()].map((d) => ({
        fromUserId: d.fromUserId,
        toUserId: d.toUserId,
        transferAt: d.transferAt,
        note: d.note,
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

  async function send(items: MaterialTransferCreateInput[], confirmDuplicates: boolean) {
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
        <Button variant="secondary" onClick={() => setMenuOpen((v) => !v)}>
          <FileSpreadsheet size={16} />
          Nhập excel
          <ChevronDown size={14} />
        </Button>
        {menuOpen && (
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <Download size={14} />
              Tải file mẫu
            </button>
            <button type="button" onClick={openModal} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Upload size={14} />
              Nhập từ Excel
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <Modal title="Nhập phiếu điều chuyển từ Excel" onClose={() => setModalOpen(false)} size="lg">
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-slate-600">
              File cần hai sheet. Sheet <b>“{SHEET.phieu}”</b>: {PHIEU_HEADER.join(", ")}. Sheet <b>“{SHEET.dongHang}”</b>:{" "}
              {DONG_HANG_HEADER.join(", ")}.
            </p>
            <p className="text-slate-600">
              <b>Mã phiếu tạm</b> chỉ dùng để nối hai sheet, không lưu lại — các dòng hàng cùng một mã tạm sẽ vào cùng một
              phiếu. <b>Quán gửi / Quán nhận</b> gõ theo <b>tên quán</b>. Thời gian chuyển <b>phải có giờ</b> (vd 15/08/2026
              08:30) vì đó là mốc kỳ Check Cost.
            </p>
            <p className="text-slate-600">
              <b>SL chẵn</b> tính theo <b>đơn vị chính</b> của hàng hoá (file không có cột SL lẻ). <b>Mã NCC</b> và{" "}
              <b>Giá vốn</b> để trống được; có NCC mà trống giá thì lấy <b>giá xuất</b> của NCC đó.
            </p>
            <p className="text-slate-600">
              Số thập phân dùng dấu phẩy (<b>0,5</b>); dấu chấm là dấu thập phân kiểu máy, nên <b>8.000</b> đọc thành 8 chứ
              không phải 8000 — gõ giá thì ghi thẳng <b>8000</b>.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
              Nhập Excel <b>luôn tạo phiếu mới</b>, không ghi đè phiếu cũ. Nhập lại cùng một file sẽ sinh phiếu trùng — nếu
              có, bạn sẽ được cảnh báo trước khi ghi.
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
                  Chưa ghi gì cả — đã có {duplicates.length} phiếu cùng quán gửi, quán nhận và thời gian:
                </p>
                <ul className="mt-1 list-disc pl-5 text-amber-800">
                  {duplicates.slice(0, 20).map((dup) => (
                    <li key={dup.code}>
                      {dup.code} · {dup.fromName} → {dup.toName} · {formatDateTime(dup.transferAt)}
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
                <p className="font-medium">Đã tạo {result.created} phiếu điều chuyển.</p>
                <p className="mt-1 text-xs">
                  {result.codes.slice(0, 10).join(", ")}
                  {result.codes.length > 10 ? "…" : ""}
                </p>
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
