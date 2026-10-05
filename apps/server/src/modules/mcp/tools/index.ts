import type { McpTool } from "../shared";
import { getCostCheck, listCostChecks } from "./costChecks";
import { expenseProposalSpentItems } from "./expenseProposalSpentItems";
import { listMaterialTransfers } from "./listMaterialTransfers";
import { listSalesOrders } from "./listSalesOrders";
import { listShops } from "./listShops";
import { orderLines } from "./orderLines";
import { otherExpenses } from "./otherExpenses";
import { shiftExpenses } from "./shiftExpenses";
import { getStockCheck, listStockChecks } from "./stockChecks";
import { weeklyStockCheckLateness } from "./weeklyStockCheckLateness";

/**
 * Sổ đăng ký tool MCP — nguồn sự thật duy nhất. Thêm tool = tạo file trong thư mục này + thêm một
 * dòng ở đây. Trang Token MCP đọc danh mục từ mảng này (GET /api/mcp-tokens/catalog), và
 * McpToken.tools lưu đúng `name` của tool — ĐỪNG đổi tên tool đã phát hành, token đang dùng sẽ mất
 * quyền gọi nó.
 *
 * Thứ tự ở đây là thứ tự hiện trên trang Token MCP.
 */
export const MCP_TOOLS: McpTool[] = [
  listShops,
  orderLines,
  shiftExpenses,
  expenseProposalSpentItems,
  otherExpenses,
  listSalesOrders,
  listCostChecks,
  getCostCheck,
  listMaterialTransfers,
  listStockChecks,
  getStockCheck,
  weeklyStockCheckLateness,
];

export const MCP_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name);
