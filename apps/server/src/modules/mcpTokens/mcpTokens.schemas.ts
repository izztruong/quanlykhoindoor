import { z } from "zod";
import { MCP_TOOL_NAMES } from "../mcp/tools";

export const mcpTokenUpsertSchema = z.object({
  name: z.string().trim().min(1, "Tên token không được để trống").max(100),
  tools: z
    .array(z.string())
    .default([])
    .refine((tools) => tools.every((name) => MCP_TOOL_NAMES.includes(name)), "Có tool không tồn tại")
    .transform((tools) => [...new Set(tools)]),
});
