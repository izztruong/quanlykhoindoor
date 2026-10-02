import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { requirePermission } from "../../middleware/auth";
import { HttpError } from "../../utils/httpError";
import { generateMcpToken } from "../mcp/mcpAuth";
import { MCP_TOOLS } from "../mcp/tools";
import { mcpTokenUpsertSchema } from "./mcpTokens.schemas";

/**
 * Quản lý token cho MCP connector. Token đọc được dữ liệu MỌI quán trong các tool được cấp, nên
 * ngoài MCP_TOKENS.* còn đòi phạm vi ALL (DATA.SCOPE_ALL hoặc vai trò hệ thống): người chỉ thấy
 * dữ liệu quán mình không được tạo ra thứ đọc được quán khác — cùng tinh thần "không cấp được
 * quyền mình không có" của trang Vai trò.
 */
export const mcpTokensRouter = Router();

function requireScopeAll(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.scope !== "ALL") {
    next(new HttpError(403, "Cần quyền xem dữ liệu của mọi quán để quản lý token MCP"));
    return;
  }
  next();
}

mcpTokensRouter.use(requireScopeAll);

const tokenSelect = {
  id: true,
  name: true,
  tokenPrefix: true,
  tools: true,
  createdAt: true,
  lastUsedAt: true,
  createdBy: { select: { name: true } },
};

mcpTokensRouter.get("/catalog", requirePermission("MCP_TOKENS", "VIEW"), (_req, res) => {
  res.json({
    endpoint: `${env.publicUrl.replace(/\/$/, "")}/mcp`,
    items: MCP_TOOLS.map(({ name, title, description }) => ({ name, title, description })),
  });
});

// Danh sách nhỏ, trả một lần rồi phân trang ở web — giống danh sách vai trò.
mcpTokensRouter.get("/", requirePermission("MCP_TOKENS"), async (_req, res) => {
  const items = await prisma.mcpToken.findMany({ select: tokenSelect, orderBy: { createdAt: "desc" } });
  res.json({ items });
});

mcpTokensRouter.post("/", requirePermission("MCP_TOKENS"), async (req, res) => {
  const data = mcpTokenUpsertSchema.parse(req.body);
  const { token, tokenHash, tokenPrefix } = generateMcpToken();
  const created = await prisma.mcpToken.create({
    data: { name: data.name, tools: data.tools, tokenHash, tokenPrefix, createdById: req.user!.id },
    select: tokenSelect,
  });
  // Bản rõ chỉ có trong response này — DB chỉ giữ hash, mất là phải tạo token mới.
  res.status(201).json({ ...created, token });
});

mcpTokensRouter.put("/:id", requirePermission("MCP_TOKENS"), async (req, res) => {
  const id = req.params.id as string;
  const data = mcpTokenUpsertSchema.parse(req.body);
  const existing = await prisma.mcpToken.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Không tìm thấy token");
  const updated = await prisma.mcpToken.update({ where: { id }, data: { name: data.name, tools: data.tools }, select: tokenSelect });
  res.json(updated);
});

mcpTokensRouter.delete("/:id", requirePermission("MCP_TOKENS"), async (req, res) => {
  const id = req.params.id as string;
  const existing = await prisma.mcpToken.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new HttpError(404, "Không tìm thấy token");
  await prisma.mcpToken.delete({ where: { id } });
  res.status(204).end();
});
