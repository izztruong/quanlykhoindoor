import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  // `?? 4000` only falls back on null/undefined — an empty-string PORT (e.g. a
  // blank env var left behind in a hosting dashboard) would pass straight
  // through to Number(""), which is 0, making the server bind to a random
  // OS-assigned port instead of the one the platform expects. `|| 4000`
  // catches that case too since 0 and NaN are both falsy.
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  cookieName: process.env.COOKIE_NAME ?? "kho_token",
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Token tĩnh của bot Zalo, dạng "123456789:abc-xyz". KHÔNG bắt buộc: bỏ trống thì phần
  // thông báo tự tắt và mọi thứ còn lại chạy bình thường, nên không cần cấu hình gì thêm ở
  // máy dev hay CI. Khác Zalo OA, token này không hết hạn nên không cần lưu/refresh trong DB.
  zaloBotToken: process.env.ZALO_BOT_TOKEN ?? "",
};
