import type { AuthUser } from "../middleware/auth";
import { HttpError } from "./httpError";

/**
 * Quán/cơ sở mà thao tác này nhắm tới. Bỏ trống = chính mình; khai một tài khoản khác cần
 * `DATA.SCOPE_ALL`, ngoài phạm vi trả **404** (không tiết lộ tài khoản đó có tồn tại hay không).
 *
 * Gốc ở `modules/posSales`, chuyển ra `utils/` khi `bakerySales` cần đúng luật này — hai bản chép
 * tay là hai bản lệch nhau về phạm vi, và phạm vi thì không được phép lệch.
 */
export function resolveTargetUserId(user: AuthUser | undefined, requested?: string): string {
  const self = user?.id;
  if (!self) throw new HttpError(401, "Chưa đăng nhập");
  if (!requested || requested === self) return self;
  if (user.scope !== "ALL") throw new HttpError(404, "Không tìm thấy quán");
  return requested;
}
