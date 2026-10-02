import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router } from "express";
import { HttpError } from "../../utils/httpError";
import { authenticateMcpRequest } from "./mcpAuth";
import type { McpToolContext } from "./shared";
import { MCP_TOOLS } from "./tools";

/**
 * Endpoint MCP cho custom connector của claude.ai. Mount NGOÀI /api (xem app.ts) vì không đi qua
 * requireAuth: xác thực bằng McpToken trong header `Authorization: Bearer`, không phải phiên đăng nhập.
 *
 * Không giữ phiên: mỗi request dựng một McpServer mới chỉ đăng ký đúng các tool token được cấp.
 * Nhờ vậy tool không được cấp không hiện trong tools/list và gọi thẳng cũng báo không tồn tại;
 * đổi quyền token có hiệu lực ngay request kế tiếp.
 */
export const mcpRouter = Router();

function buildServer(allowedTools: string[], ctx: McpToolContext) {
  const server = new McpServer({ name: "quan-ly-kho", version: "1.0.0" });
  const allowed = new Set(allowedTools);
  // Tên trong token mà code đã gỡ thì tự rơi ra ở đây.
  for (const tool of MCP_TOOLS.filter((t) => allowed.has(t.name))) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: { readOnlyHint: true } },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.run(args, ctx);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (err) {
          // HttpError mang thông báo dành cho người dùng (vd không tìm thấy phiếu); lỗi khác thì
          // không lộ chi tiết nội bộ ra ngoài.
          if (!(err instanceof HttpError)) console.error(`Tool MCP ${tool.name} lỗi:`, err);
          const message = err instanceof HttpError ? err.message : "Lỗi máy chủ khi lấy dữ liệu";
          return { isError: true, content: [{ type: "text" as const, text: message }] };
        }
      },
    );
  }
  return server;
}

mcpRouter.post("/", async (req, res) => {
  const token = await authenticateMcpRequest(req);
  if (!token) {
    res.status(401).json({ error: "Token MCP không hợp lệ hoặc đã bị xoá" });
    return;
  }

  const server = buildServer(token.tools, { tokenId: token.id, tokenName: token.name });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Chế độ không giữ phiên không có luồng SSE mở sẵn (GET) hay phiên để đóng (DELETE).
mcpRouter.all("/", (_req, res) => {
  res.status(405).set("Allow", "POST").json({ error: "Chỉ hỗ trợ POST" });
});
