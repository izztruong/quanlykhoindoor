import type { Prisma } from "../generated/prisma/client";

/**
 * Bộ lọc nguồn dữ liệu "trong kỳ" của một phiếu Check Cost — CHỖ DUY NHẤT định nghĩa phiếu nào được
 * cộng vào cột Nhận / Đã huỷ / Xuất.
 *
 * Hai nơi dùng: `computeCostCheckReport` (tính số chốt vào phiếu) và module `costCheckSources` (bấm vào
 * ô số để xem phiếu nào làm nên con số đó). Nếu mỗi bên tự viết `where`, danh sách phiếu hiện ra sẽ
 * lệch với số trên phiếu mà không ai biết bên nào sai — đổi nguồn của Check Cost thì sửa Ở ĐÂY.
 *
 * Biên đóng cả hai đầu, khớp `utils/costCheckImpact`. Doanh số POS cố ý khác (trái đóng phải mở, xem
 * `loadPosSalesForPeriod`) — đừng đồng bộ hai cái.
 */
export interface CostCheckPeriod {
  /** Quán được check (`CostCheck.userId`). */
  shopUserId: string;
  /** `openingStockCheck.checkedAt` */
  from: Date;
  /** `closingStockCheck.checkedAt` */
  to: Date;
}

/**
 * "Hàng về trong kỳ" lấy từ PHIẾU NHẬP KHO của kho quán, không phải SL nhận trên đơn hàng: đơn hàng chỉ
 * còn là đề xuất của quán, còn hàng thực nhận (kể cả hàng mua ngoài, không qua đơn) ghi ở phiếu nhập.
 * `Warehouse.shopUserId` là chỗ nối kho với tài khoản quán mà Check Cost neo theo.
 *
 * KHÔNG lọc theo `type`: phiếu `OTHER` cũng là hàng về trong kỳ. Đừng thêm `type: "PURCHASE"` vào đây —
 * làm vậy là âm thầm bỏ mất hàng nhập loại khác. (Enum chỉ còn PURCHASE/OTHER đúng vì TRANSFER_IN sẽ
 * đếm hai lần với phiếu điều chuyển đến.)
 */
export function stockImportItemsWhere(p: CostCheckPeriod): Prisma.StockImportItemWhereInput {
  return {
    stockImport: {
      status: "COMPLETED",
      transactionAt: { gte: p.from, lte: p.to },
      warehouse: { shopUserId: p.shopUserId },
    },
  };
}

/** Chỉ dòng huỷ được tích "trừ trong Check Cost"; dòng bỏ tích coi như hàng đã dùng (vẫn nằm trong actualUsed). */
export function wasteItemsWhere(p: CostCheckPeriod): Prisma.MaterialWasteItemWhereInput {
  return {
    deductInCostCheck: true,
    materialWaste: { createdById: p.shopUserId, wasteAt: { gte: p.from, lte: p.to } },
  };
}

/** Huỷ món/đồ đã pha — quy ngược về nguyên liệu bằng công thức có hiệu lực lúc huỷ. Cùng luật tick "Trừ CC". */
export function wasteFinishedItemsWhere(p: CostCheckPeriod): Prisma.MaterialWasteFinishedItemWhereInput {
  return {
    deductInCostCheck: true,
    materialWaste: { createdById: p.shopUserId, wasteAt: { gte: p.from, lte: p.to } },
  };
}

/** Nhận điều chuyển từ quán khác — gộp chung cột "Nhận trong kỳ" với phiếu nhập kho. */
export function transferInItemsWhere(p: CostCheckPeriod): Prisma.MaterialTransferItemWhereInput {
  return { materialTransfer: { toUserId: p.shopUserId, transferAt: { gte: p.from, lte: p.to } } };
}

/** Điều chuyển đi quán khác — cột "Xuất trong kỳ". */
export function transferOutItemsWhere(p: CostCheckPeriod): Prisma.MaterialTransferItemWhereInput {
  return { materialTransfer: { fromUserId: p.shopUserId, transferAt: { gte: p.from, lte: p.to } } };
}
