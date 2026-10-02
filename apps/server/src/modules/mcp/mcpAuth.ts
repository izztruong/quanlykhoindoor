import { createHash, randomBytes } from "node:crypto";
import type { Request } from "express";
import { prisma } from "../../config/db";

const TOKEN_PREFIX = "kho_mcp_";
/** Số ký tự đầu của bản rõ lưu lại để nhận diện token trong danh sách. */
const DISPLAY_PREFIX_LENGTH = 12;

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Sinh token mới. Bản rõ chỉ trả về đúng lần này — DB chỉ giữ hash. */
export function generateMcpToken() {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, tokenHash: hashMcpToken(token), tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH) };
}

// Ghi lastUsedAt tối đa một lần mỗi phút cho mỗi token: Claude gọi liền nhiều tool trong một câu
// hỏi, mỗi lần một UPDATE qua Neon là phí. Đếm trong bộ nhớ là đủ — mất khi khởi động lại cũng không sao.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const lastUsedWrittenAt = new Map<string, number>();

function touchLastUsed(tokenId: string) {
  const now = Date.now();
  if (now - (lastUsedWrittenAt.get(tokenId) ?? 0) < LAST_USED_WRITE_INTERVAL_MS) return;
  lastUsedWrittenAt.set(tokenId, now);
  // Không await: ghi mốc dùng gần nhất không được làm chậm hay hỏng request.
  prisma.mcpToken.update({ where: { id: tokenId }, data: { lastUsedAt: new Date(now) } }).catch((err) => {
    console.error("Không ghi được lastUsedAt của token MCP:", err);
  });
}

/** Token hợp lệ của request, hoặc null. Đọc tươi từ DB mỗi request — xoá/sửa token có hiệu lực ngay. */
export async function authenticateMcpRequest(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const record = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: { id: true, name: true, tools: true },
  });
  if (record) touchLastUsed(record.id);
  return record;
}
