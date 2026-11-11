import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Cạnh dài tối đa sau khi nén — đủ đọc chữ trên hóa đơn mà không giữ ảnh cỡ gốc. Giống bản web. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Trần cho bước NÉN, không phải cho cả lượt chọn ảnh: thời gian người dùng lướt thư viện là vô hạn
 * một cách chính đáng, đặt hạn ở đó là báo lỗi oan rồi vứt ảnh họ vừa chọn.
 *
 * Có trần vì `renderAsync`/`saveAsync` từng treo im (ảnh đã chọn xong mà vòng xoay quay mãi, màn
 * Hoàn thành khoá cứng). Hết hạn thì ném lỗi để chỗ gọi gỡ vòng xoay — lời gọi native vẫn chạy tiếp
 * vì không huỷ được, nhưng kết quả về muộn sẽ bị bỏ qua.
 */
const COMPRESS_TIMEOUT_MS = 30_000;

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  // Hết hạn rồi `work` mới ném thì cuộc đua đã xong, lỗi đó không còn ai nghe và React Native kêu
  // "unhandled promise rejection" — nuốt riêng ở đây, không ảnh hưởng nhánh thắng cuộc.
  work.catch(() => undefined);
  return Promise.race([work, limit]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export interface CompressedImage {
  /** Chỉ phần dữ liệu base64, không kèm tiền tố "data:image/jpeg;base64," — khớp payload API. */
  dataBase64: string;
  contentType: "image/jpeg";
  size: number;
  /** URI cục bộ để xem trước trước khi gửi. */
  uri: string;
}

/**
 * Ảnh chụp bằng điện thoại 3–5 MB; server chặn ở 1,5 MB sau giải mã và express giới hạn body 10 MB,
 * nên phải nén trước khi gửi. Ảnh ra luôn là JPEG, kể cả nguồn HEIC của iPhone.
 */
async function compress(asset: ImagePicker.ImagePickerAsset): Promise<CompressedImage> {
  const longestEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  const context = ImageManipulator.manipulate(asset.uri);
  if (longestEdge > MAX_EDGE) {
    // Chỉ truyền cạnh dài, cạnh còn lại để thư viện tự tính cho đúng tỷ lệ.
    if ((asset.width ?? 0) >= (asset.height ?? 0)) context.resize({ width: MAX_EDGE });
    else context.resize({ height: MAX_EDGE });
  }

  const image = await context.renderAsync();
  const result = await image.saveAsync({ base64: true, compress: JPEG_QUALITY, format: SaveFormat.JPEG });
  if (!result.base64) throw new Error("Không nén được ảnh, vui lòng thử lại");

  return {
    dataBase64: result.base64,
    contentType: "image/jpeg",
    // base64 phình ~4/3 so với dữ liệu gốc — quy ngược về số byte thật để so với hạn mức server.
    size: Math.round((result.base64.length * 3) / 4),
    uri: result.uri,
  };
}

async function pick(
  launch: (options: ImagePicker.ImagePickerOptions) => Promise<ImagePicker.ImagePickerResult>,
  selectionLimit: number,
): Promise<CompressedImage[]> {
  const result = await launch({
    mediaTypes: ["images"],
    allowsMultipleSelection: selectionLimit > 1,
    selectionLimit,
    quality: 1,
  });
  if (result.canceled) return [];
  return withTimeout(
    Promise.all(result.assets.map(compress)),
    COMPRESS_TIMEOUT_MS,
    "Xử lý ảnh quá lâu, vui lòng thử lại với ảnh nhỏ hơn",
  );
}

/** Chụp mới bằng camera. Trả mảng rỗng nếu người dùng bấm huỷ hoặc từ chối quyền. */
export async function captureReceiptPhoto(): Promise<CompressedImage[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("Cần cho phép truy cập camera để chụp ảnh chứng từ");
  return pick((options) => ImagePicker.launchCameraAsync(options), 1);
}

/** Chọn từ thư viện, tối đa `limit` ảnh còn lại của khoản chi. */
export async function pickReceiptPhotos(limit: number): Promise<CompressedImage[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Cần cho phép truy cập thư viện ảnh");
  return pick((options) => ImagePicker.launchImageLibraryAsync(options), limit);
}
