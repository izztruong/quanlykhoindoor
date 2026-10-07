"use client";

import { Pagination } from "@/components/data-table/Pagination";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ManualEntry } from "@/components/posSales/ManualEntry";
import { PosMappingEditor } from "@/components/posSales/PosMappingEditor";
import {
  useDeletePosSaleDay,
  useImportPosSales,
  usePosSaleDays,
  useSuggestPosMappings,
  type PosImportResult,
  type PosSaleRowInput,
} from "@/hooks/usePosSales";
import { useUserOptions } from "@/hooks/useUsers";
import { ApiError } from "@/lib/api-client";
import { sanitizeExcelRow } from "@/lib/excelExport";
import {
  actionGroupKey,
  isDefaultSoldGroup,
  parsePosOrderLog,
  type PosOrderLogParseResult,
} from "@/lib/posOrderLog";
import { parseSoldAt } from "@/lib/posSaleDate";
import { formatNumber } from "@/lib/format";
import ExcelJS from "exceljs";
import { Download, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const cellClass = "border border-slate-200 px-3 py-2";
const headClass = "border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase text-slate-500";

/**
 * Chỉ số cột gom vào MỘT hằng số dùng chung cho mẫu trắng và phần nhập — đổi bố cục ở một chỗ.
 * File POS xuất ra có GIỜ TỪNG ĐƠN, nên cột thời gian là mốc đầy đủ chứ không phải chỉ ngày.
 */
const EXCEL_COLUMNS = ["Thời gian bán*", "Tên món*", "Số lượng*"] as const;
const COL = { soldAt: 1, posName: 2, quantity: 3 } as const;

export default function PosSalesPage() {
  const { data: users = [] } = useUserOptions();
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading } = usePosSaleDays({ userId: userId || undefined, page });
  const importSales = useImportPosSales();
  const deleteDay = useDeletePosSaleDay();
  const suggest = useSuggestPosMappings();

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [result, setResult] = useState<PosImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Giữ lại các ô đã đọc từ file để nhập LẠI ngay sau khi ánh xạ xong, khỏi bắt chọn lại file.
  const [parsedRows, setParsedRows] = useState<PosSaleRowInput[] | null>(null);

  // Đường nhập thứ hai: file nhật ký order do POS xuất thẳng ra, không theo file mẫu của phần mềm này.
  // Phải chọn loại thao tác nào tính là đã bán trước khi nhập, nên tách state riêng.
  const [posLogOpen, setPosLogOpen] = useState(false);
  const [posLog, setPosLog] = useState<PosOrderLogParseResult | null>(null);
  const [posLogPicked, setPosLogPicked] = useState<Set<string>>(new Set());

  async function downloadTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Doanh số POS");
    sheet.columns = EXCEL_COLUMNS.map((header) => ({ header, width: 24 }));
    sheet.getRow(1).font = { bold: true };
    // Ghi mẫu dạng dd/mm/yyyy cho khớp thói quen VN. Phần nhập còn đọc được dd-mm-yyyy, yyyy-mm-dd và
    // ô ngày-giờ thật của Excel — xem lib/posSaleDate.ts.
    sheet.addRow(sanitizeExcelRow(["20/09/2026 14:35", "Bạc Xỉu (L)", 2]));
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mau-doanh-so-pos.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** Gửi các ô đã đọc lên server. Tách riêng để dùng lại được sau khi ánh xạ xong, không phải chọn lại file. */
  function runImport(rows: PosSaleRowInput[]) {
    setError(null);
    importSales.mutate(
      { userId, rows },
      {
        onSuccess: (res) => {
          setResult(res);
          // Xin gợi ý ngay tại đây — sự kiện "nhập xong và còn tên thiếu" là lúc duy nhất biết được
          // danh sách tên, nên không phải đợi người dùng bấm thêm một nút nữa.
          if (res.unmappedNames.length > 0) suggest.mutate(res.unmappedNames);
        },
        onError: (err) => setError(err instanceof ApiError ? err.message : "Nhập doanh số thất bại"),
      },
    );
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!userId) {
      setParseErrors(["Vui lòng chọn quán trước khi nhập."]);
      return;
    }

    setImporting(true);
    setParseErrors([]);
    setResult(null);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setParseErrors(["Không đọc được sheet nào trong file."]);
        return;
      }

      // Kiểm HÀNG TIÊU ĐỀ trước khi đọc dòng nào — đọc lệch cột thì số lượng thành giờ, và file trông
      // vẫn bình thường.
      const headerRow = sheet.getRow(1);
      const mismatch = EXCEL_COLUMNS.findIndex(
        (expected, index) => String(headerRow.getCell(index + 1).value ?? "").trim() !== expected,
      );
      if (mismatch !== -1) {
        setParseErrors([
          `Hàng tiêu đề không khớp file mẫu ở cột ${mismatch + 1} (cần "${EXCEL_COLUMNS[mismatch]}"). Vui lòng tải lại file mẫu.`,
        ]);
        return;
      }

      const errors: string[] = [];
      // Gộp về mức giờ ngay ở trình duyệt: file 2 tháng có thể hàng chục nghìn dòng đơn lẻ, gộp trước
      // thì payload nhỏ đi hàng chục lần.
      const byCell = new Map<string, PosSaleRowInput>();

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const soldAt = parseSoldAt(row.getCell(COL.soldAt).value);
        const posName = String(row.getCell(COL.posName).value ?? "").trim();
        const qtyRaw = row.getCell(COL.quantity).value;
        if (!soldAt && !posName && (qtyRaw === null || qtyRaw === undefined || qtyRaw === "")) return;

        if (!soldAt) {
          errors.push(
            `Dòng ${rowNumber}: không đọc được thời gian bán — cần cả ngày và giờ, dạng "20/09/2026 14:35" hoặc "2026-09-20 14:35"`,
          );
          return;
        }
        if (!posName) {
          errors.push(`Dòng ${rowNumber}: thiếu tên món`);
          return;
        }
        const quantity = Number(qtyRaw);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          errors.push(`Dòng ${rowNumber}: số lượng không hợp lệ`);
          return;
        }

        const { soldOn, hour } = soldAt;
        const key = `${soldOn}|${hour}|${posName}`;
        const current = byCell.get(key);
        if (current) current.quantity += quantity;
        else byCell.set(key, { soldOn, hour, posName, quantity });
      });

      setParseErrors(errors);
      const rows = [...byCell.values()];
      if (rows.length === 0) {
        setParseErrors([...errors, "Không có dòng nào đọc được."]);
        return;
      }

      setParsedRows(rows);
      runImport(rows);
    } catch {
      setParseErrors(["Đọc file thất bại. Vui lòng kiểm tra định dạng file."]);
    } finally {
      setImporting(false);
    }
  }

  /**
   * Đọc file nhật ký order của POS. Chỉ PHÂN TÍCH, chưa nhập: người dùng còn phải soát danh sách loại
   * thao tác và tích loại nào tính là đã bán — file là nhật ký thao tác nên cộng mù là tính luôn cả
   * món khách đã huỷ.
   */
  async function handlePosLogFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!userId) {
      setParseErrors(["Vui lòng chọn quán trước khi nhập."]);
      return;
    }

    setImporting(true);
    setParseErrors([]);
    setResult(null);
    setError(null);
    setPosLog(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        setParseErrors(["Không đọc được sheet nào trong file."]);
        return;
      }
      const parsed = parsePosOrderLog(sheet);
      setPosLog(parsed);
      setPosLogPicked(new Set(parsed.groups.filter(isDefaultSoldGroup).map(actionGroupKey)));
    } catch {
      setParseErrors(["Đọc file thất bại. Vui lòng kiểm tra định dạng file."]);
    } finally {
      setImporting(false);
    }
  }

  /** Gộp các dòng đã tích về mức ô (ngày, giờ, món) rồi gửi đi — cùng payload với đường nhập file mẫu. */
  function runPosLogImport() {
    if (!posLog) return;
    const byCell = new Map<string, PosSaleRowInput>();
    for (const row of posLog.rows) {
      if (!posLogPicked.has(actionGroupKey(row))) continue;
      const key = `${row.soldOn}|${row.hour}|${row.posName}`;
      const current = byCell.get(key);
      if (current) current.quantity += row.quantity;
      else byCell.set(key, { soldOn: row.soldOn, hour: row.hour, posName: row.posName, quantity: row.quantity });
    }

    // Ô gộp lại ra 0 (thêm rồi bỏ ngay trong cùng giờ) là không bán được gì — bỏ đi là đúng. Ra số ÂM
    // thì nghĩa là món được thêm ở ngoài khoảng thời gian của file rồi bị bỏ trong file; báo ra chứ
    // không im lặng, vì nó cho biết khoảng xuất file đang cắt ngang đơn.
    const all = [...byCell.values()];
    const rows = all.filter((r) => r.quantity > 0);
    const negative = all.filter((r) => r.quantity < 0);
    const zero = all.length - rows.length - negative.length;

    const notes: string[] = [];
    if (zero > 0) notes.push(`${zero} ô có tổng bằng 0 (thêm rồi bỏ trong cùng giờ) nên không nhập.`);
    if (negative.length > 0) {
      notes.push(
        `${negative.length} ô có tổng ÂM nên không nhập — món bị bỏ trong file nhưng được thêm từ trước khoảng thời gian xuất file: ` +
          negative.map((r) => `${r.posName} ${r.soldOn} ${String(r.hour).padStart(2, "0")}h`).join(", "),
      );
    }
    setParseErrors(notes);

    if (rows.length === 0) {
      setParseErrors([...notes, "Không còn ô nào để nhập. Kiểm tra lại các loại thao tác đã tích."]);
      return;
    }
    setParsedRows(rows);
    runImport(rows);
  }

  const posLogPickedQuantity = (posLog?.groups ?? [])
    .filter((g) => posLogPicked.has(actionGroupKey(g)))
    .reduce((sum, g) => sum + g.quantity, 0);

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Doanh số POS</h1>
        <p className="text-sm text-slate-500">
          Hai đường nhập: <strong>file Excel</strong> xuất từ POS (có giờ từng đơn, chính xác nhất) hoặc{" "}
          <strong>gõ tay theo ca</strong> khi xuất file mất công. Cả hai đều lưu ở mức <strong>giờ</strong> rồi cắt ca theo
          cấu hình, nên đổi khung giờ ca về sau không phải nhập lại. Nhập lại là <strong>ghi đè</strong>, không cộng dồn.
        </p>
      </div>

      <ManualEntry />

      <Card>
        <CardBody className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-600">Quán</label>
            <Select
              value={userId}
              onChange={(e) => {
                setUserId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả quán</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="button"
              onClick={() => {
                setResult(null);
                setParseErrors([]);
                setError(null);
                setImportOpen(true);
              }}
            >
              <Upload size={14} />
              Nhập từ Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setResult(null);
                setParseErrors([]);
                setError(null);
                setPosLog(null);
                setPosLogPicked(new Set());
                setPosLogOpen(true);
              }}
            >
              <Upload size={14} />
              Nhập từ file POS
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ngày đã có dữ liệu</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3 overflow-x-auto">
          {isLoading ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có dữ liệu doanh số nào.</p>
          ) : (
            <>
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={headClass}>Ngày</th>
                    <th className={headClass}>Quán</th>
                    <th className={headClass}>Tổng SL bán</th>
                    <th className={headClass}>Số ô (giờ × món)</th>
                    <th className={headClass}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((day) => (
                    <tr key={`${day.userId}-${day.soldOn}`}>
                      <td className={cellClass}>{day.soldOn.slice(0, 10)}</td>
                      <td className={cellClass}>{day.user?.name ?? "—"}</td>
                      <td className={cellClass}>{formatNumber(day.totalQuantity)}</td>
                      <td className={cellClass}>{day.cellCount}</td>
                      <td className={cellClass}>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => deleteDay.mutate({ userId: day.userId, soldOn: day.soldOn.slice(0, 10) })}
                          disabled={deleteDay.isPending}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={data?.page ?? 1}
                pageSize={data?.pageSize ?? 20}
                total={data?.total ?? 0}
                onPageChange={setPage}
                // Cố định 20 dòng/trang: danh sách này chỉ để soát ngày nào có/thiếu dữ liệu, không ai
                // cần xem 100 ngày một lúc.
                onPageSizeChange={() => undefined}
                pageSizeOptions={[20]}
              />
            </>
          )}
        </CardBody>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {importOpen && (
        <Modal title="Nhập doanh số từ Excel" onClose={() => setImportOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn file Excel theo đúng thứ tự cột trong file mẫu: {EXCEL_COLUMNS.join(", ")}. Dữ liệu nhập cho quán{" "}
              <strong>{users.find((u) => u.id === userId)?.name ?? "(chưa chọn)"}</strong>.
              <br />
              Cột thời gian <strong>phải có cả ngày và giờ</strong> (chỉ có ngày thì không biết thuộc ca nào). Đọc được:{" "}
              <code>20/09/2026 14:35</code>, <code>20-09-2026 14:35</code>, <code>2026-09-20 14:35</code>, và ô ngày-giờ thật
              của Excel. Ngày luôn đứng trước tháng — file dạng <code>mm/dd/yyyy</code> sẽ bị từ chối chứ không đọc ngược.
            </p>
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={downloadTemplate}>
              <Download size={14} />
              Tải file mẫu
            </Button>
            <input type="file" accept=".xlsx" onChange={handleImportFile} disabled={importing || importSales.isPending} />
            {(importing || importSales.isPending) && <p className="text-sm text-slate-400">Đang xử lý...</p>}

            {parseErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">Bỏ qua {parseErrors.length} dòng lỗi:</p>
                <ul className="mt-1 list-disc pl-5">
                  {parseErrors.slice(0, 10).map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
                {parseErrors.length > 10 && <p className="mt-1">… và {parseErrors.length - 10} dòng nữa.</p>}
              </div>
            )}

            {result && result.unmappedNames.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Chưa nhập gì cả — còn {result.unmappedNames.length} tên chưa ánh xạ.</p>
                <p className="mt-1 text-xs">
                  Nhập nửa vời sẽ tạo ra một ngày thiếu món, trông y như ngày bán ít và không cách nào phát hiện về sau.
                  Ánh xạ ngay bên dưới — dòng không phải món (phí ship, voucher…) thì chọn <em>Bỏ qua</em>. Lưu xong hệ
                  thống tự nhập lại, không phải chọn file lần nữa.
                </p>
                <div className="mt-3 rounded border border-amber-200 bg-white p-3">
                  <PosMappingEditor
                    posNames={result.unmappedNames}
                    suggestions={suggest.data}
                    suggesting={suggest.isPending}
                    saveLabel="Lưu ánh xạ và nhập lại"
                    onSaved={() => {
                      setResult(null);
                      if (parsedRows) runImport(parsedRows);
                    }}
                  />
                </div>
                <Link href="/admin/pos-item-mapping" className="mt-2 inline-block text-xs underline">
                  Hoặc mở trang Ánh xạ món POS
                </Link>
              </div>
            )}

            {result && result.unmappedNames.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <p>
                  Đã ghi {result.written} ô dữ liệu cho {result.daysReplaced} ngày.
                </p>
                {result.ignoredNames.length > 0 && (
                  <p className="mt-1 text-xs">
                    Bỏ qua {result.ignoredNames.length} tên đã khai không phải món: {result.ignoredNames.join(", ")}
                  </p>
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

      {posLogOpen && (
        <Modal title="Nhập từ file POS (nhật ký order)" onClose={() => setPosLogOpen(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Chọn thẳng file <strong>Nhật ký order</strong> do POS xuất ra, không cần sửa cột. Cột được tìm theo{" "}
              <strong>tên tiêu đề</strong> (Ngày, Giờ, Tên món, Số lượng) nên POS đổi thứ tự cột vẫn đọc được. Dữ liệu nhập
              cho quán{" "}
              <strong>{users.find((u) => u.id === userId)?.name ?? "— chưa chọn —"}</strong>; file không được dùng để đoán
              quán, chọn sai là ghi sai quán.
            </p>
            <input type="file" accept=".xlsx" onChange={handlePosLogFile} disabled={importing || importSales.isPending} />
            {(importing || importSales.isPending) && <p className="text-sm text-slate-400">Đang xử lý...</p>}

            {posLog && posLog.title && <p className="text-xs text-slate-500">Tiêu đề file: {posLog.title}</p>}

            {posLog && posLog.groups.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-slate-700">Loại thao tác nào tính là đã bán?</p>
                <p className="text-xs text-slate-500">
                  File là nhật ký thao tác trên đơn, không phải danh sách món đã bán. Mặc định chỉ tích{" "}
                  <strong>Thêm món</strong> — soát lại danh sách dưới đây, nếu POS ghi món khách huỷ bằng một loại khác thì
                  đừng tích loại đó.
                </p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={headClass} />
                      <th className={headClass}>Loại log</th>
                      <th className={headClass}>Loại thao tác</th>
                      <th className={`${headClass} text-right`}>Số dòng</th>
                      <th className={`${headClass} text-right`}>Tổng SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posLog.groups.map((group) => {
                      const key = actionGroupKey(group);
                      return (
                        <tr key={key}>
                          <td className={cellClass}>
                            <input
                              type="checkbox"
                              checked={posLogPicked.has(key)}
                              onChange={(e) =>
                                setPosLogPicked((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(key);
                                  else next.delete(key);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className={cellClass}>{group.logType || "—"}</td>
                          <td className={cellClass}>{group.actionType || "—"}</td>
                          <td className={`${cellClass} text-right`}>{formatNumber(group.rowCount)}</td>
                          <td className={`${cellClass} text-right`}>{formatNumber(group.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-sm text-slate-600">
                  Sẽ nhập <strong>{formatNumber(posLogPickedQuantity)}</strong> đơn vị từ {formatNumber(posLog.rows.length)}{" "}
                  dòng đọc được. Số lượng mang dấu, nên thao tác bỏ món tự trừ ra.
                </p>
                {posLog.groups.some((g) => !posLogPicked.has(actionGroupKey(g))) && (
                  <p className="text-xs text-amber-700">
                    Đang bỏ qua{" "}
                    {posLog.groups
                      .filter((g) => !posLogPicked.has(actionGroupKey(g)))
                      .map((g) => `"${g.actionType || "—"}" (${formatNumber(g.rowCount)} dòng)`)
                      .join(", ")}
                    . Nếu loại đó cũng làm đổi số món trên đơn thì phải tích, không thì số sẽ lệch.
                  </p>
                )}
              </div>
            )}

            {posLog && posLog.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Bỏ qua {posLog.errors.length} dòng không đọc được:</p>
                <ul className="mt-1 max-h-32 list-disc overflow-auto pl-5 text-xs">
                  {posLog.errors.slice(0, 50).map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            {parseErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <ul className="list-disc pl-5">
                  {parseErrors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            {result && result.unmappedNames.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <p>
                  Đã ghi {result.written} ô dữ liệu cho {result.daysReplaced} ngày.
                </p>
                {result.ignoredNames.length > 0 && (
                  <p className="mt-1 text-xs">
                    Bỏ qua {result.ignoredNames.length} tên đã khai không phải món: {result.ignoredNames.join(", ")}
                  </p>
                )}
              </div>
            )}

            {result && result.unmappedNames.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">
                  Còn {result.unmappedNames.length} tên món chưa ánh xạ nên CHƯA ghi dòng nào — khai ánh xạ rồi nhập lại.
                </p>
                <div className="mt-2">
                  <PosMappingEditor
                    posNames={result.unmappedNames}
                    suggestions={suggest.data ?? []}
                    suggesting={suggest.isPending}
                    saveLabel="Lưu ánh xạ và nhập lại"
                    onSaved={() => {
                      setResult(null);
                      if (parsedRows) runImport(parsedRows);
                    }}
                  />
                </div>
                <Link href="/admin/pos-item-mapping" className="mt-2 inline-block text-xs underline">
                  Hoặc mở trang Ánh xạ món POS
                </Link>
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPosLogOpen(false)}>
                Đóng
              </Button>
              <Button
                type="button"
                disabled={!posLog || posLogPicked.size === 0 || importing || importSales.isPending}
                onClick={runPosLogImport}
              >
                Nhập {posLogPickedQuantity > 0 ? `${formatNumber(posLogPickedQuantity)} đơn vị` : ""}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
