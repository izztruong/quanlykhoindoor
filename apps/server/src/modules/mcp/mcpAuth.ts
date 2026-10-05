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
  if (!header) {
    logRejection(req, "NO_HEADER", "không có header Authorization");
    return null;
  }
  // Node tự bỏ khoảng trắng cuối giá trị header, nên "Bearer " không kèm token tới đây thành "Bearer".
  if (header.trim() === "Bearer") {
    logRejection(req, "BAD_FORMAT", "sau \"Bearer\" không có token", header);
    return null;
  }
  if (!header.startsWith("Bearer ")) {
    logRejection(req, "BAD_FORMAT", "header Authorization không bắt đầu bằng \"Bearer \"", header);
    return null;
  }
  const token = header.slice(7).trim();
  const record = await prisma.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: { id: true, name: true, tools: true },
  });
  if (!record) {
    logRejection(req, "UNKNOWN_TOKEN", "token không khớp token nào (sai, đã xoá, hoặc của môi trường khác)", token);
    return null;
  }
  touchLastUsed(record.id);
  return record;
}

/**
 * Ghi lý do từ chối lên log (Render) để chẩn đoán connector: claude.ai chỉ báo chung "Couldn't
 * connect", không nói server trả gì. KHÔNG bao giờ ghi nguyên token — chỉ chữ đầu của header (thường
 * là "Bearer"), độ dài, và DISPLAY_PREFIX_LENGTH ký tự đầu, đúng bằng tokenPrefix vốn đã hiện công
 * khai trên trang Token MCP. Header khác chỉ ghi TÊN, không ghi giá trị.
 */
function logRejection(req: Request, reason: string, detail: string, value?: string) {
  const info: Record<string, unknown> = {
    reason,
    method: typeof req.body?.method === "string" ? req.body.method : undefined,
    userAgent: req.headers["user-agent"],
    headerNames: Object.keys(req.headers),
  };
  if (value !== undefined) {
    // Cắt cùng độ dài với prefix: thiếu chữ "Bearer" thì chữ đầu CHÍNH LÀ token.
    info.firstWord = value.split(" ")[0]?.slice(0, DISPLAY_PREFIX_LENGTH);
    info.length = value.length;
    info.prefix = value.replace(/^bearer\s+/i, "").slice(0, DISPLAY_PREFIX_LENGTH);
  }
  console.warn(`[MCP] Từ chối: ${detail}`, JSON.stringify(info));
}
