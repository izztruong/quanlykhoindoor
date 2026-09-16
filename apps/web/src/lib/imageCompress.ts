/**
 * Nén ảnh ngay trên trình duyệt trước khi gửi lên server.
 *
 * Đây là thứ giữ cho cả thiết kế đứng vững: ảnh chụp điện thoại 3–5 MB xuống còn ~200 KB, nhờ đó
 * gửi kèm base64 trong JSON vẫn lọt trần 4,5 MB của proxy Vercel và không ngốn dung lượng R2.
 * Dùng canvas có sẵn của trình duyệt, không thêm thư viện.
 */

/** Cạnh dài tối đa sau khi nén — đủ đọc chữ trên hóa đơn mà không giữ ảnh cỡ gốc. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export interface CompressedImage {
  /** Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64," — khớp payload API. */
  dataBase64: string;
  contentType: "image/jpeg";
  size: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.onload = () => {
      const result = String(reader.result);
      // FileReader trả "data:image/jpeg;base64,xxxx" — cắt phần đầu, chỉ giữ dữ liệu.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: File): Promise<CompressedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // iPhone thường tự đổi HEIC sang JPEG khi chọn qua <input accept="image/*">, nhưng không phải
    // lúc nào cũng vậy — và trình duyệt không giải mã được HEIC thì sẽ rơi vào đây.
    throw new Error(`Không đọc được ảnh "${file.name}" — thử chụp lại hoặc chọn ảnh JPG/PNG`);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ nén ảnh");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error(`Không nén được ảnh "${file.name}"`);

  return { dataBase64: await blobToBase64(blob), contentType: "image/jpeg", size: blob.size };
}
