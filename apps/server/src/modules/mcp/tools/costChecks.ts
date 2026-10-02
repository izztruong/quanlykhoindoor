import { z } from "zod";
import { prisma } from "../../../config/db";
import type { FinancialSummary, MaterialRow } from "../../costChecks/costChecks.service";
import { HttpError } from "../../../utils/httpError";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, num, shopIdParam } from "../shared";

// Số liệu luôn đọc từ reportSnapshot (chốt cứng lúc tạo phiếu), KHÔNG tính lại: sửa giá vốn/công
// thức về sau không được làm đổi phiếu đã tạo — y như trang chi tiết.
type Snapshot = { rows: MaterialRow[]; summary: FinancialSummary } | null;

const SUMMARY_DOC =
  "summary: doanh thu (revenue*), giảm giá (discount*), doanh thu thuần (netRevenue*), chi phí NVL dự kiến theo công thức " +
  "(expected*) và thực tế (actual*), cốc ống hút (cupsStraws), tổng giá vốn thực (actualCost*), huỷ NVL (wasteNvl*). " +
  "Hậu tố Tra = trà, Dav = đồ ăn vặt; *Pct là tỷ lệ trên doanh thu thuần.";

const header = {
  user: { select: { name: true } },
  openingStockCheck: { select: { code: true, checkedAt: true } },
  closingStockCheck: { select: { code: true, checkedAt: true } },
} as const;

export const listCostChecks = defineTool({
  name: "list_cost_checks",
  title: "Check Cost — danh sách phiếu",
  description:
    "Phiếu Check Cost có NGÀY KIỂM CUỐI KỲ rơi trong khoảng ngày. Kỳ của phiếu = từ phiếu kiểm đầu kỳ tới phiếu kiểm cuối kỳ. " +
    `Mỗi phiếu kèm ${SUMMARY_DOC} Chi tiết từng nguyên liệu: gọi get_cost_check. ` +
    "status CANCELLED = phiếu đã huỷ (thường đã có phiếu khác thay), mặc định bị loại.",
  input: {
    ...dateRangeInput,
    shopId: shopIdParam,
    includeCancelled: z.boolean().optional().describe("true = lấy cả phiếu đã huỷ"),
  },
  run: async ({ from, to, shopId, includeCancelled }) => {
    const items = await prisma.costCheck.findMany({
      where: {
        closingStockCheck: { checkedAt: dateTimeRange(from, to) },
        userId: shopId,
        status: includeCancelled ? undefined : "ACTIVE",
      },
      orderBy: { closingStockCheck: { checkedAt: "asc" } },
      include: header,
    });
    return capRows(
      items.map((c) => ({
        id: c.id,
        code: c.code,
        shop: c.user.name,
        status: c.status,
        periodFrom: formatVnDateTime(c.openingStockCheck.checkedAt),
        periodTo: formatVnDateTime(c.closingStockCheck.checkedAt),
        openingStockCheck: c.openingStockCheck.code,
        closingStockCheck: c.closingStockCheck.code,
        createdAt: formatVnDateTime(c.createdAt),
        note: c.note,
        summary: (c.reportSnapshot as Snapshot)?.summary ?? null,
      })),
    );
  },
});

export const getCostCheck = defineTool({
  name: "get_cost_check",
  title: "Check Cost — chi tiết một phiếu",
  description:
    "Chi tiết một phiếu Check Cost theo mã (CC…) hoặc id. rows = từng nguyên liệu: tồn đầu (openingQty), nhận trong kỳ " +
    "(receivedQty, gồm cả nhận điều chuyển), điều chuyển đi (transferOutQty), huỷ (wastedQty), tồn cuối (closingQty), " +
    "thực dùng (actualUsed), định mức theo công thức (theoretical), chênh lệch (variance = actualUsed − theoretical); " +
    `SL tính theo unitLabel. soldItems = món đã bán trong kỳ. ${SUMMARY_DOC}`,
  input: { codeOrId: z.string().min(1).describe("Mã phiếu (vd CC2608…) hoặc id") },
  run: async ({ codeOrId }) => {
    const c = await prisma.costCheck.findFirst({
      where: { OR: [{ code: codeOrId }, { id: codeOrId }] },
      include: {
        ...header,
        soldItems: { include: { finishedGoodItem: { select: { code: true, name: true } } } },
      },
    });
    if (!c) throw new HttpError(404, `Không tìm thấy phiếu Check Cost "${codeOrId}"`);
    const snapshot = c.reportSnapshot as Snapshot;
    return {
      code: c.code,
      shop: c.user.name,
      status: c.status,
      periodFrom: formatVnDateTime(c.openingStockCheck.checkedAt),
      periodTo: formatVnDateTime(c.closingStockCheck.checkedAt),
      note: c.note,
      discountTra: num(c.discountTra),
      discountDav: num(c.discountDav),
      summary: snapshot?.summary ?? null,
      rows: (snapshot?.rows ?? []).map(({ productId: _productId, ...row }) => row),
      soldItems: c.soldItems.map((s) => ({ code: s.finishedGoodItem.code, name: s.finishedGoodItem.name, quantity: num(s.quantitySold) })),
    };
  },
});
