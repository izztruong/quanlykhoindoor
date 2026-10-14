"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useLookupStockImportsByCodes, type StockImportByCode } from "@/hooks/useStockImports";
import { ApiError, api } from "@/lib/api-client";
import { compressImage, type CompressedImage } from "@/lib/imageCompress";
import { MAX_BULK_IMAGES_PER_SLIP, matchImageToSlipCode } from "@/lib/stockImportImages";
import { Camera } from "lucide-react";
import { useState } from "react";
import { MAX_IMPORT_IMAGES } from "./StockImportImagesCard";

/** Một phiếu kèm ảnh đã nén — giữ lại để bấm "Thử đẩy lại ảnh" mà khỏi chọn file lần nữa. */
interface SlipImages {
  id: string;
  code: string;
  images: CompressedImage[];
}

/**
 * Đẩy ảnh là MỘT request mỗi phiếu — không gộp được vì web gọi API qua rewrite `/api/*` của Next nên
 * mọi request đi qua proxy Vercel, trần 4,5 MB, mà ảnh base64 phình thêm ~33%.
 *
 * Chạy song song tối đa 3: Render gói free là máy nhỏ, nhiều kết nối Neon cùng lúc dễ nghẽn hơn là nhanh.
 */
const UPLOAD_CONCURRENCY = 3;

async function runWithLimit(tasks: (() => Promise<void>)[], limit: number) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) await tasks[next++]!();
    }),
  );
}

/**
 * Đính ảnh chứng từ cho nhiều phiếu nhập kho một lượt, ghép theo **tên file**.
 *
 * Tách hẳn khỏi nhập Excel: tên ảnh mang mã phiếu THẬT nên dùng được bất cứ lúc nào — nhập Excel hôm
 * nay, mai đính ảnh vẫn chạy. (Mã phiếu tạm của file Excel không lưu vào DB, dùng nó thì đóng trình
 * duyệt là mất bản đồ.)
 */
export function StockImportImageActions() {
  const lookup = useLookupStockImportsByCodes();
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [attached, setAttached] = useState<{ images: number; slips: number } | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<SlipImages[]>([]);

  function openModal() {
    setErrors([]);
    setAttached(null);
    setProgress(null);
    setFailed([]);
    setModalOpen(true);
  }

  async function handlePickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Chọn lại cùng bộ file vẫn phải nổ event.
    e.target.value = "";
    if (picked.length === 0) return;

    setBusy(true);
    setErrors([]);
    setAttached(null);
    setFailed([]);
    try {
      // Đoán mã từ tên file TRƯỚC, để chỉ hỏi server đúng những mã có khả năng.
      const found = [...new Set(picked.map((file) => firstCodeLike(file.name)).filter((code): code is string => !!code))];
      if (found.length === 0) {
        setErrors([`Không tên ảnh nào có dạng mã phiếu (vd PN261014778870001.jpg).`]);
        return;
      }

      // `imageCount` phải lấy TƯƠI ngay lúc đẩy: người dùng có thể vừa đính tay ở tab khác.
      const slips: StockImportByCode[] = await lookup.mutateAsync(found);
      const codes = slips.map((slip) => slip.code);
      const slipByCode = new Map(slips.map((slip) => [slip.code, slip]));

      const nextErrors: string[] = [];
      const slots = new Map<string, { file: File; index: number }[]>();
      for (const file of picked) {
        const matched = matchImageToSlipCode(file.name, codes);
        if (!matched) {
          nextErrors.push(`"${file.name}": không tìm thấy phiếu nhập kho nào mang mã này.`);
          continue;
        }
        const list = slots.get(matched.code) ?? [];
        list.push({ file, index: matched.index });
        slots.set(matched.code, list);
      }

      const ready: SlipImages[] = [];
      for (const [code, list] of slots) {
        const slip = slipByCode.get(code)!;
        const taken = new Map<number, string>();
        const usable: File[] = [];
        for (const entry of [...list].sort((a, b) => a.index - b.index)) {
          const other = taken.get(entry.index);
          if (other) {
            nextErrors.push(`Phiếu ${code}: "${other}" và "${entry.file.name}" cùng là ảnh thứ ${entry.index}.`);
            continue;
          }
          if (entry.index > MAX_BULK_IMAGES_PER_SLIP) {
            nextErrors.push(`Phiếu ${code}: đính hàng loạt tối đa ${MAX_BULK_IMAGES_PER_SLIP} ảnh, bỏ qua "${entry.file.name}".`);
            continue;
          }
          taken.set(entry.index, entry.file.name);
          usable.push(entry.file);
        }

        const room = MAX_IMPORT_IMAGES - slip.imageCount;
        if (usable.length > room) {
          nextErrors.push(
            room <= 0
              ? `Phiếu ${code} đã đủ ${MAX_IMPORT_IMAGES} ảnh, không nhận thêm.`
              : `Phiếu ${code} đang có ${slip.imageCount} ảnh, chỉ nhận thêm ${room} — bỏ bớt rồi chọn lại.`,
          );
          continue;
        }

        const compressed: CompressedImage[] = [];
        for (const file of usable) {
          try {
            compressed.push(await compressImage(file));
          } catch (err) {
            // compressImage nêu sẵn tên file trong câu lỗi (ảnh HEIC iPhone không giải mã được).
            nextErrors.push(err instanceof Error ? err.message : `Không nén được ảnh "${file.name}"`);
          }
        }
        if (compressed.length > 0) ready.push({ id: slip.id, code, images: compressed });
      }

      setErrors(nextErrors);
      await uploadImages(ready);
    } catch (err) {
      setErrors([err instanceof ApiError ? err.message : "Đọc ảnh thất bại."]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Đẩy hỏng giữa chừng thì KHÔNG có gì để hoàn tác — phiếu vốn đã có sẵn, chỉ là thiếu ảnh. Báo đúng
   * phiếu nào còn thiếu và giữ ảnh đã nén trong state để bấm thử lại mà khỏi chọn file lần nữa.
   */
  async function uploadImages(slips: SlipImages[]) {
    if (slips.length === 0) {
      setProgress(null);
      setFailed([]);
      return;
    }
    setProgress({ done: 0, total: slips.length });
    const stillFailed: SlipImages[] = [];
    await runWithLimit(
      slips.map((slip) => async () => {
        try {
          await api.post(`/stock-imports/${slip.id}/images`, {
            images: slip.images.map(({ contentType, dataBase64 }) => ({ contentType, dataBase64 })),
          });
        } catch {
          stillFailed.push(slip);
        } finally {
          setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
        }
      }),
      UPLOAD_CONCURRENCY,
    );
    setProgress(null);
    setFailed(stillFailed);

    const done = slips.filter((slip) => !stillFailed.includes(slip));
    setAttached({ images: done.reduce((sum, slip) => sum + slip.images.length, 0), slips: done.length });
  }

  async function handleRetry() {
    setBusy(true);
    try {
      await uploadImages(failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={openModal}>
        <Camera size={16} />
        Nhập ảnh chứng từ
      </Button>

      {modalOpen && (
        <Modal title="Đính ảnh chứng từ hàng loạt" onClose={() => setModalOpen(false)} size="lg">
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-slate-600">
              Đặt tên ảnh theo <b>mã phiếu nhập kho</b>: <code>PN261014778870001.jpg</code>, ảnh thứ hai thêm{" "}
              <code>-2</code> vào cuối. Tối đa <b>{MAX_BULK_IMAGES_PER_SLIP} ảnh mỗi phiếu</b> cho đường này.
            </p>
            <p className="text-slate-600">
              Mã phiếu xem ở cột <b>Mã phiếu</b> ngoài danh sách, hoặc trong file Excel xuất theo bộ lọc. Việc này
              <b> không liên quan tới nhập Excel</b> — nhập phiếu hôm nay, hôm khác đính ảnh vẫn được.
            </p>

            <input type="file" accept="image/*" multiple onChange={handlePickFiles} disabled={busy} className="text-sm" />
            {busy && !progress && <p className="text-xs text-slate-400">Đang đọc và nén ảnh...</p>}
            {progress && (
              <p className="text-xs text-slate-500">
                Đang đẩy ảnh {progress.done}/{progress.total} phiếu…
              </p>
            )}

            {attached && attached.slips > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                Đã đính {attached.images} ảnh vào {attached.slips} phiếu.
              </div>
            )}

            {failed.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <p className="font-medium">{failed.length} phiếu chưa đẩy được ảnh:</p>
                <p className="mt-1 text-xs">{failed.map((slip) => slip.code).join(", ")}</p>
                <p className="mt-1 text-xs">Ảnh vẫn còn trong trình duyệt — bấm thử lại, hoặc mở từng phiếu để đính tay.</p>
                <div className="mt-2">
                  <Button size="sm" disabled={busy} onClick={handleRetry}>
                    Thử đẩy lại ảnh
                  </Button>
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-red-600">{errors.length} ảnh chưa đính được:</p>
                <ul className="mt-1 list-disc pl-5 text-red-600">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  Sửa tên rồi chọn lại — những ảnh đã đính ở trên không bị ảnh hưởng.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Đoán mã phiếu từ tên file để biết nên hỏi server những mã nào. Chỉ cần "trông giống mã", việc khớp
 * thật nằm ở `matchImageToSlipCode` sau khi đã biết mã nào có thật.
 */
function firstCodeLike(fileName: string): string | null {
  const base = fileName.replace(/\.[^.]*$/, "").trim();
  const matched = /^(PN[A-Za-z0-9]+?)(-\d+)?$/.exec(base);
  return matched ? matched[1]! : null;
}
