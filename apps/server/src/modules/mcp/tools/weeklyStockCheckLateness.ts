import { prisma } from "../../../config/db";
import { capRows, dateRangeInput, dateTimeRange, defineTool, formatVnDateTime, shopIdParam } from "../shared";

/**
 * Đếm theo đúng dấu muộn đã CHỐT lúc nộp (StockCheck.isLate / dueAt), không tính lại hạn — giống
 * chấm xanh/đỏ/xám trên web, và đổi lịch hạn về sau không viết lại lịch sử. Xem utils/deadlines.
 */
export const weeklyStockCheckLateness = defineTool({
  name: "weekly_stock_check_lateness",
  title: "Phiếu kiểm tuần — số lần nộp muộn theo quán",
  description:
    "Đếm phiếu kiểm kê TUẦN của từng quán trong khoảng ngày, lọc theo NGÀY KIỂM (kỳ của phiếu, giờ VN). " +
    "Mỗi quán: total (số phiếu đã nộp), late (nộp sau hạn), onTime (đúng hạn), notEvaluated (phiếu tạo trước khi có " +
    "chức năng chấm muộn hoặc lúc đó chưa đặt lịch hạn — không tính là muộn hay đúng hạn), và lateChecks = danh sách " +
    "phiếu muộn: mã, ngày kiểm, lúc nộp (submittedAt), hạn (dueAt), trễ bao nhiêu giờ (lateHours). " +
    "Muộn = lúc lưu phiếu vào hệ thống sau hạn admin đặt, chốt ngay lúc nộp. " +
    "CHỈ đếm phiếu đã nộp: quán bỏ hẳn một tuần không có phiếu nào thì không hiện ở đây (thiếu phiếu ≠ nộp muộn). " +
    "Quán không có phiếu nào trong khoảng vẫn được liệt kê với total = 0.",
  input: { ...dateRangeInput, shopId: shopIdParam },
  run: async ({ from, to, shopId }) => {
    const [shops, checks] = await Promise.all([
      prisma.user.findMany({
        where: shopId ? { id: shopId } : { role: { isShop: true } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.stockCheck.findMany({
        where: { type: "WEEKLY", checkedAt: dateTimeRange(from, to), createdById: shopId },
        orderBy: { checkedAt: "asc" },
        select: {
          code: true,
          checkedAt: true,
          createdAt: true,
          dueAt: true,
          isLate: true,
          createdById: true,
          createdBy: { select: { name: true } },
        },
      }),
    ]);

    type ShopSummary = {
      shopId: string | null;
      shop: string | null;
      total: number;
      late: number;
      onTime: number;
      notEvaluated: number;
      lateChecks: { code: string; checkedAt: string | null; submittedAt: string | null; dueAt: string | null; lateHours: number }[];
    };
    const byShop = new Map<string | null, ShopSummary>();
    const summaryFor = (id: string | null, name: string | null) => {
      let summary = byShop.get(id);
      if (!summary) {
        summary = { shopId: id, shop: name, total: 0, late: 0, onTime: 0, notEvaluated: 0, lateChecks: [] };
        byShop.set(id, summary);
      }
      return summary;
    };
    for (const shop of shops) summaryFor(shop.id, shop.name);

    // Phiếu do tài khoản không phải quán lập (vd admin lập hộ) vẫn được đếm, thành một dòng riêng.
    for (const check of checks) {
      const summary = summaryFor(check.createdById, check.createdBy?.name ?? null);
      summary.total += 1;
      if (!check.dueAt) {
        summary.notEvaluated += 1;
      } else if (check.isLate) {
        summary.late += 1;
        summary.lateChecks.push({
          code: check.code,
          checkedAt: formatVnDateTime(check.checkedAt),
          submittedAt: formatVnDateTime(check.createdAt),
          dueAt: formatVnDateTime(check.dueAt),
          lateHours: Math.round(((check.createdAt.getTime() - check.dueAt.getTime()) / 3_600_000) * 10) / 10,
        });
      } else {
        summary.onTime += 1;
      }
    }

    const summaries = [...byShop.values()];
    return {
      totals: {
        total: checks.length,
        late: summaries.reduce((n, s) => n + s.late, 0),
        onTime: summaries.reduce((n, s) => n + s.onTime, 0),
        notEvaluated: summaries.reduce((n, s) => n + s.notEvaluated, 0),
      },
      ...capRows(summaries),
    };
  },
});
