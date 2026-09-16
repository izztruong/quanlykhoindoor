import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { HttpError } from "./httpError";

/**
 * Lưu ảnh chứng từ trên Cloudflare R2. R2 nói giao thức S3 nên dùng thẳng SDK của AWS, chỉ khác
 * endpoint và region luôn là "auto".
 *
 * Bucket để PRIVATE: không phát URL công khai, mỗi lần xem thì ký một URL có hạn (xem
 * `signedImageUrl`). Ký là phép băm cục bộ, không gọi mạng, nên rẻ.
 */

/** Đủ cấu hình để đụng tới R2 chưa. Thiếu thì tính năng đính ảnh tắt, phần còn lại vẫn chạy. */
export function isStorageConfigured(): boolean {
  return Boolean(env.r2AccountId && env.r2Bucket && env.r2AccessKeyId && env.r2SecretAccessKey);
}

let client: S3Client | null = null;

/** Tạo lười: server phải khởi động được cả khi chưa khai báo R2. */
function getClient(): S3Client {
  if (!isStorageConfigured()) {
    throw new HttpError(503, "Chưa cấu hình kho ảnh (Cloudflare R2) nên không đính được ảnh");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
    });
  }
  return client;
}

/**
 * Lỗi S3 thô ("NoSuchBucket", "InvalidAccessKeyId"…) dội thẳng lên giao diện thì người dùng không
 * biết phải làm gì. Đổi mấy trường hợp cấu hình sai thành câu tiếng Việt chỉ đúng việc cần sửa.
 */
function toFriendlyError(error: unknown): HttpError {
  const name = (error as S3ServiceException)?.name ?? "";

  if (name === "NoSuchBucket") {
    return new HttpError(503, `Chưa có bucket "${env.r2Bucket}" trên Cloudflare R2 — tạo bucket này rồi thử lại`);
  }
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch") {
    return new HttpError(503, "Khoá truy cập Cloudflare R2 không đúng — kiểm tra lại R2_ACCESS_KEY_ID và R2_SECRET_ACCESS_KEY");
  }
  if (name === "AccessDenied") {
    return new HttpError(503, `Token Cloudflare R2 không có quyền ghi vào bucket "${env.r2Bucket}"`);
  }

  console.error("[objectStorage] lỗi R2:", error);
  return new HttpError(502, "Không tải được ảnh lên kho ảnh, vui lòng thử lại");
}

export async function putImage(key: string, body: Buffer, contentType: string): Promise<void> {
  try {
    await getClient().send(
      new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, Body: body, ContentType: contentType }),
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw toFriendlyError(error);
  }
}

/** URL xem ảnh, mặc định sống 1 giờ — đủ cho một phiên xem, hết hạn thì tải lại danh sách là có URL mới. */
export async function signedImageUrl(key: string, seconds = 3600): Promise<string> {
  try {
    return await getSignedUrl(getClient(), new GetObjectCommand({ Bucket: env.r2Bucket, Key: key }), {
      expiresIn: seconds,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw toFriendlyError(error);
  }
}

/**
 * Xoá file trên R2. **Nuốt lỗi và chỉ ghi log**: xoá được bản ghi mới là việc chính của người dùng,
 * sót một file trên R2 không đáng để chặn thao tác — dọn tay sau cũng được.
 */
export async function deleteImages(keys: string[]): Promise<void> {
  if (keys.length === 0 || !isStorageConfigured()) return;

  try {
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: env.r2Bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  } catch (error) {
    console.error("[objectStorage] không xoá được ảnh trên R2:", keys, error);
  }
}
