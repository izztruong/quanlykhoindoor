/**
 * Chạy server dev trỏ vào một database LOCAL khác `.env`.
 *
 *   npm run dev        → DB dev thường (kho_db), không qua script này
 *   npm run dev:copy   → bản copy dữ liệu production (kho_prod_copy)
 *
 * Viết bằng Node thay vì đặt biến ngay trên dòng script của npm, vì cú pháp
 * `VAR=x tsx ...` không chạy trên PowerShell/cmd — mà repo này không có cross-env.
 *
 * Bản copy được tạo bằng tay (không nằm trong docker-compose.yml) vì production chạy
 * PostgreSQL 18 còn container dev là 16, và image PG 18 đổi đường dẫn dữ liệu:
 *
 *   docker run -d --name kho_prod_copy_pg18 --restart unless-stopped \
 *     -e POSTGRES_USER=kho_user -e POSTGRES_PASSWORD=kho_pass -e POSTGRES_DB=kho_prod_copy \
 *     -p 5434:5432 -v kho_prod_copy_data:/var/lib/postgresql postgres:18-alpine
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import "dotenv/config";

const DEFAULT_COPY_URL = "postgresql://kho_user:kho_pass@localhost:5434/kho_prod_copy";

const TARGETS = {
  copy: {
    label: "BẢN COPY DỮ LIỆU PRODUCTION",
    url: process.env.PROD_COPY_DATABASE_URL || DEFAULT_COPY_URL,
    // Làm rỗng khoá R2: `.env` đang giữ khoá thật trỏ vào bucket production, mà dữ liệu copy mang
    // đúng objectKey thật — xoá một khoản chi trong lúc thử sẽ xoá file thật, không lấy lại được.
    // Để rỗng thì isStorageConfigured() trả false và deleteImages() thoát ngay, phần còn lại vẫn chạy.
    env: {
      R2_ACCOUNT_ID: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET_NAME: "",
      // Điện thoại cài bản thật còn token trong dữ liệu copy — bật push là bắn thông báo của dữ liệu thử.
      PUSH_ENABLED: "false",
    },
  },
};

const name = process.argv[2];
const target = TARGETS[name];
if (!target) {
  console.error(`Không biết đích "${name ?? ""}". Dùng: node scripts/devDb.mjs ${Object.keys(TARGETS).join(" | ")}`);
  process.exit(1);
}

/**
 * Chặn cứng mọi host không phải máy này. Đây là lớp bảo vệ có chủ đích: `.env` đang chứa
 * PROD_DATABASE_URL, và một lần gõ nhầm vào PROD_COPY_DATABASE_URL là server dev ghi thẳng vào
 * production. Không có cờ nào để bỏ qua kiểm tra này.
 */
function assertLocal(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error(`Chuỗi kết nối không đọc được: ${url}`);
    process.exit(1);
  }
  if (!["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host)) {
    console.error(`TỪ CHỐI CHẠY: "${host}" không phải máy này.\nLệnh này chỉ dành cho database local.`);
    process.exit(1);
  }
  return host;
}

/**
 * Thử kết nối Postgres THẬT (không chỉ mở TCP) để báo lỗi rõ thay vì để Prisma văng lỗi khó đọc.
 *
 * Cố ý không dùng `net.connect`: trên Docker Desktop cho Windows, bộ chuyển cổng vẫn **nhận** kết nối
 * TCP ở cổng đã publish dù container đã tắt, nên phép thử TCP báo thành công rồi server treo sau đó.
 * Chỉ một lượt bắt tay Postgres mới phân biệt được "có DB" và "chỉ có cổng".
 */
async function checkDatabase(url) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    await client.query("select 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

const host = assertLocal(target.url);
const port = Number(new URL(target.url).port || 5432);
const dbName = new URL(target.url).pathname.replace(/^\//, "");

/**
 * Từ chối chạy nếu cổng API đã có người giữ.
 *
 * Đây là chốt chặn cho một lần đã mất thời gian thật: một `npm run dev` cũ (trỏ vào DB dev) còn sống và
 * giữ cổng 4000, nên lệnh này in banner "BẢN COPY" rồi không bind được — server trả lời vẫn là cái cũ,
 * và mọi truy vấn đi vào SAI DATABASE trong khi màn hình nói là đúng. Thà không chạy còn hơn chạy mà
 * người dùng tin sai.
 */
async function assertApiPortFree(port) {
  const { default: net } = await import("node:net");
  const inUse = await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err) => resolve(err.code === "EADDRINUSE"));
    server.once("listening", () => server.close(() => resolve(false)));
    // KHÔNG chỉ định host — để Node dùng mặc định, đúng như `app.listen(env.port)` của server thật.
    // Trên Windows, bind tường minh vào "0.0.0.0" hay "127.0.0.1" vẫn THÀNH CÔNG dù đã có tiến trình
    // nghe ở cổng đó, nên chỉ định host làm phép thử này luôn báo "cổng trống" và vô dụng.
    server.listen(port);
  });
  if (inUse) {
    console.error(`Cổng ${port} đã có tiến trình khác giữ — rất có thể là một server cũ đang trỏ vào DB khác.`);
    console.error(`  Dừng nó trước, nếu không server trả lời sẽ là cái cũ và bạn đọc sai database.`);
    console.error(`  Xem ai giữ:  netstat -ano | findstr :${port}`);
    process.exit(1);
  }
}

await assertApiPortFree(Number(process.env.PORT) || 4000);

const check = await checkDatabase(target.url);
if (!check.ok) {
  console.error(`Không kết nối được database "${dbName}" tại ${host}:${port}`);
  console.error(`  ${check.message}`);
  console.error(`  Container có đang chạy không?   docker start kho_prod_copy_pg18`);
  process.exit(1);
}

console.log("─".repeat(72));
console.log(`  ${target.label}`);
console.log(`  database: ${dbName} tại ${host}:${port}`);
if (target.env.R2_BUCKET_NAME === "") console.log("  ảnh chứng từ: TẮT (không thể xoá file R2 thật)");
if (target.env.PUSH_ENABLED === "false") console.log("  thông báo đẩy: TẮT");
console.log(`  đổi lại DB dev: dừng lệnh này rồi chạy  npm run dev`);
console.log("─".repeat(72));

// Gọi thẳng CLI của tsx bằng chính node đang chạy, KHÔNG qua `npx` và KHÔNG `shell: true`:
// shell trên Windows làm Node phát cảnh báo DEP0190 (đối số bị nối chuỗi chứ không escape), mà ở đây
// không cần shell để làm gì cả.
const tsxCli = path.join(path.dirname(createRequire(import.meta.url).resolve("tsx/package.json")), "dist/cli.mjs");

const child = spawn(process.execPath, [tsxCli, "watch", "src/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: target.url, ...target.env },
});
child.on("exit", (code) => process.exit(code ?? 0));
