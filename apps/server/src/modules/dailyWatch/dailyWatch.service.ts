import { prisma } from "../../config/db";
import type { DailyWatchKind, Prisma } from "../../generated/prisma/client";
import { getEstimatedOnHand } from "../../utils/estimatedStock";
import {
  DEFAULT_COVER_DAYS,
  daysUntilNextCreditOrder,
  isCreditOrderDay,
  nextFreeTransferDay,
  pickPrioritySupplier,
  resolveCadence,
} from "../../utils/orderCadence";
import { dailyWatchNotifications } from "../notifications/notifications.service";
import { getDailyUsage } from "../reorderSuggestions/reorderSuggestions.service";

/**
 * THEO DÕI CUỐI NGÀY — màn của admin, tính sẵn mỗi tối.
 *
 * Với mỗi (quán × nguyên liệu): tồn ước tính so với mức dùng/ngày cho ra "còn đủ mấy ngày", rồi so tiếp
 * với số ngày tới mốc gọi kế tiếp. Thiếu trước mốc gọi thì tìm quán đang dư để đề xuất điều chuyển.
 *
 * **Tính sẵn rồi lưu, không tính lúc mở màn**: mở màn phải nhanh, và giữ lịch sử "ngày nào hệ thống đã
 * cảnh báo gì" là cách duy nhất về sau đo được nó có báo đúng không — cùng tinh thần với `ReorderRun`.
 *
 * **Giới hạn phải nói rõ trên màn:** doanh số POS nhập tay nên hệ thống chỉ biết sau khi có người nhập.
 * Sớm nhất là CUỐI CA — cuối ca sáng Chủ nhật thấy tồn hụt thì kịp điều chuyển cho ca chiều, nhưng không
 * thể cảnh báo lúc 10 giờ sáng. Màn hiện `finishedAt` để người đọc biết số liệu tính đến lúc nào.
 */

/** Chỉ nêu ra khi còn ít hơn ngần này ngày tồn. Xa hơn thì chưa phải việc của hôm nay. */
const HORIZON_DAYS = 14;

/**
 * Quán được coi là "đang dư" khi còn nhiều hơn ngần này số ngày mà quán thiếu đang cần.
 *
 * Để 1,5 lần chứ không phải 1: chuyển đi đúng mức mình cần là biến quán cho thành quán thiếu ở lượt sau.
 */
const SURPLUS_RATIO = 1.5;

export interface DailyWatchFindingInput {
  kind: DailyWatchKind;
  userId: string;
  productId?: string;
  supplierId?: string;
  fromUserId?: string;
  daysLeft?: number | null;
  daysToOrder?: number | null;
  quantity?: number | null;
  amount?: number | null;
  freeTransfer?: boolean;
  title: string;
  reasons: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Ngày kinh doanh hôm nay theo giờ VN — Render chạy UTC nên không được dùng giờ máy. */
export function vnBusinessDate(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function parseBusinessDate(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

/**
 * Tính toàn bộ việc cần nêu cho một ngày, KHÔNG ghi DB.
 *
 * Tách khỏi `runDailyWatch` để kiểm chứng được bằng script mà không để lại bản ghi.
 */
export async function computeDailyWatch(now: Date = new Date()): Promise<{
  findings: DailyWatchFindingInput[];
  shopCount: number;
}> {
  const shops = await prisma.user.findMany({
    where: { role: { isShop: true } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (shops.length === 0) return { findings: [], shopCount: 0 };

  const transferDay = nextFreeTransferDay(now);
  const creditDays = daysUntilNextCreditOrder(now);

  // Định lượng của mọi quán — chỉ theo dõi hàng quán thật sự gọi.
  const thresholds = await prisma.productReorderThreshold.findMany({
    where: { userId: { in: shops.map((s) => s.id) } },
    include: { product: { include: { unit: true, productGroup: true } } },
  });
  const productIds = [...new Set(thresholds.map((t) => t.productId))];
  if (productIds.length === 0) return { findings: [], shopCount: shops.length };

  const prices = await prisma.productSupplierPrice.findMany({
    where: { productId: { in: productIds } },
    include: { supplier: { select: { id: true, name: true, freeShipThreshold: true } } },
  });
  const pricesByProduct = new Map<string, typeof prices>();
  for (const price of prices) {
    const list = pricesByProduct.get(price.productId) ?? [];
    list.push(price);
    pricesByProduct.set(price.productId, list);
  }

  // Mức dùng và tồn ước tính của từng quán. Chạy lần lượt theo quán chứ không gộp: cả hai hàm nhận
  // userId đơn lẻ, và số quán chỉ vài cái.
  const perShop = new Map<
    string,
    {
      usage: Awaited<ReturnType<typeof getDailyUsage>>;
      estimated: Awaited<ReturnType<typeof getEstimatedOnHand>>;
      ownProductIds: Set<string>;
    }
  >();
  for (const shop of shops) {
    const own = thresholds.filter((t) => t.userId === shop.id).map((t) => t.productId);
    perShop.set(shop.id, {
      usage: await getDailyUsage(shop.id, own),
      estimated: await getEstimatedOnHand({ userId: shop.id, productIds: own, now }),
      ownProductIds: new Set(own),
    });
  }

  const findings: DailyWatchFindingInput[] = [];
  const shopName = new Map(shops.map((s) => [s.id, s.name]));

  /** Số ngày tới mốc gọi kế tiếp của một hàng hoá, theo nhịp đã chốt ở mục 1.8. */
  function daysToOrderFor(productId: string, threshold: (typeof thresholds)[number]): { days: number; label: string } {
    const { supplier } = pickPrioritySupplier(
      (pricesByProduct.get(productId) ?? []).map((p) => ({ ...p, supplierName: p.supplier.name })),
    );
    const cadence = resolveCadence(threshold.product.orderCadence, supplier?.hasCredit ?? false);
    if (cadence === "CREDIT_TWICE_MONTHLY") {
      return { days: creditDays, label: `hàng công nợ (${supplier?.supplier.name ?? "chưa khai NCC"}), mốc gọi 15 và 30` };
    }
    const cover = threshold.coverDays ?? threshold.product.coverDays ?? DEFAULT_COVER_DAYS;
    return { days: cover, label: `hàng trả ngay, gọi mỗi ${cover} ngày` };
  }

  // --- 1 & 2. Thiếu trước ngày gọi, và đề xuất điều chuyển ---
  for (const threshold of thresholds) {
    const shop = perShop.get(threshold.userId);
    if (!shop || !threshold.product.active) continue;
    // Hàng mua tập trung không phải việc của quán — admin đặt ở màn riêng.
    if (threshold.product.orderCadence === "CENTRAL") continue;
    if (threshold.mode === "OFF") continue;

    const usage = shop.usage.get(threshold.productId);
    const estimated = shop.estimated.get(threshold.productId);
    if (!usage || !estimated) continue;

    const dailyUsage = usage.dailyUsage;
    if (dailyUsage == null || dailyUsage <= 0) continue; // không đoán khi chưa biết mức dùng
    if (estimated.anchorSource === "NONE") continue; // chưa từng khai tồn thì không có gì để tính từ đó

    const daysLeft = round2(estimated.quantity / dailyUsage);
    if (daysLeft > HORIZON_DAYS) continue;

    const order = daysToOrderFor(threshold.productId, threshold);
    const unit = threshold.product.unit?.name ?? "";
    const productName = threshold.product.name;

    if (daysLeft >= order.days) {
      // Đủ dùng tới mốc gọi — chỉ nêu khi HÔM NAY đúng mốc gọi (mục 3 bên dưới xử lý gộp theo quán).
      continue;
    }

    const shortQty = round3(Math.max(0, dailyUsage * order.days - estimated.quantity));
    const reasons = [
      `Tồn ước tính ${estimated.quantity} ${unit}`.trim(),
      `Mức dùng ${round3(dailyUsage)}/ngày (${usage.source === "COST_CHECK" ? "theo Check Cost" : "suy từ lịch sử nhận hàng"})`,
      `Còn đủ ${daysLeft} ngày, mà ${order.days} ngày nữa mới tới mốc gọi — ${order.label}`,
      `Thiếu khoảng ${shortQty} ${unit} để cầm cự tới đó`.trim(),
      ...estimated.reasons,
    ];

    findings.push({
      kind: "SHORTFALL",
      userId: threshold.userId,
      productId: threshold.productId,
      daysLeft,
      daysToOrder: order.days,
      quantity: shortQty,
      title: `${shopName.get(threshold.userId)} còn ${daysLeft} ngày ${productName}`,
      reasons,
    });

    // --- Tìm quán đang dư cùng hàng đó ---
    const donors = shops
      .filter((s) => s.id !== threshold.userId)
      .map((s) => {
        const other = perShop.get(s.id);
        if (!other || !other.ownProductIds.has(threshold.productId)) return null;
        const otherUsage = other.usage.get(threshold.productId)?.dailyUsage;
        const otherStock = other.estimated.get(threshold.productId);
        if (otherStock == null || otherStock.anchorSource === "NONE") return null;
        // Quán chưa biết mức dùng thì không kết luận là dư — chuyển hàng của họ đi có thể làm họ hết.
        if (otherUsage == null || otherUsage <= 0) return null;
        const otherDaysLeft = otherStock.quantity / otherUsage;
        const spare = otherStock.quantity - otherUsage * order.days * SURPLUS_RATIO;
        return spare > 0 ? { shop: s, otherDaysLeft: round2(otherDaysLeft), spare: round3(spare) } : null;
      })
      .filter((d): d is NonNullable<typeof d> => d != null)
      .sort((a, b) => b.spare - a.spare);

    const donor = donors[0];
    if (!donor) continue;

    const transferQty = round3(Math.min(shortQty, donor.spare));
    // Kịp hay không: hàng phải tới trước khi quán nhận hết.
    const inTime = transferDay.daysAway <= daysLeft;
    const donorEstimate = perShop.get(donor.shop.id)!.estimated.get(threshold.productId)!;
    const reasonsTransfer = [
      `${donor.shop.name} còn ${donor.otherDaysLeft} ngày — dư khoảng ${donor.spare} ${unit}`.trim(),
      `Chuyển ${transferQty} ${unit} sang ${shopName.get(threshold.userId)}`.trim(),
      // Nói rõ đây là mức TỐI THIỂU: dữ liệu thật cho ra những con số như "0,104 Túi", đúng về số học
      // (quán dùng 0,035 Túi/ngày) nhưng không ai chuyển một phần mười túi. Người chuyển tự làm tròn lên
      // mức thực tế — hệ thống không tự làm vì không biết hàng đó chia nhỏ được tới đâu.
      `Đây là lượng TỐI THIỂU để cầm cự tới mốc gọi — thực tế chuyển tròn theo đơn vị đóng gói`,
      // Độ tin của con số bên quán cho cũng quan trọng như bên quán thiếu.
      `Tồn của ${donor.shop.name}: khai cách đây ${donorEstimate.anchorAgeDays ?? "?"} ngày`,
      inTime
        ? transferDay.daysAway === 0
          ? "Hôm nay đúng ngày chuyển miễn phí — chuyển được ngay, không mất ship"
          : `Ngày chuyển miễn phí còn ${transferDay.daysAway} ngày, vẫn kịp trước khi hết (${daysLeft} ngày)`
        : `KHÔNG kịp ngày chuyển miễn phí (còn ${transferDay.daysAway} ngày, mà quán hết sau ${daysLeft} ngày) — chuyển gấp thì MẤT TIỀN SHIP`,
      "Chỉ giữ lại phần dư trên 1,5 lần nhu cầu của quán cho, để chuyển đi không làm quán đó thành quán thiếu",
    ];

    findings.push({
      kind: "TRANSFER",
      userId: threshold.userId,
      fromUserId: donor.shop.id,
      productId: threshold.productId,
      daysLeft,
      daysToOrder: order.days,
      quantity: transferQty,
      freeTransfer: inTime,
      title: `Chuyển ${transferQty} ${unit} ${productName}: ${donor.shop.name} → ${shopName.get(threshold.userId)}`.replace(
        /\s+/g,
        " ",
      ),
      reasons: reasonsTransfer,
    });
  }

  // --- 3. Đơn tới một NCC đã đạt ngưỡng miễn ship → gọi luôn, không đợi tới ngày gọi ---
  const openItems = await prisma.salesOrderItem.findMany({
    where: { salesOrder: { status: { in: ["DRAFT", "PENDING_CONFIRM"] } } },
    select: { productId: true, quantity: true, salesOrder: { select: { code: true, createdById: true } } },
  });

  const byShopSupplier = new Map<string, { amount: number; codes: Set<string> }>();
  const supplierMeta = new Map<string, { name: string; threshold: number | null }>();
  for (const item of openItems) {
    const userId = item.salesOrder.createdById;
    if (!userId || !shopName.has(userId)) continue;
    const { supplier } = pickPrioritySupplier(
      (pricesByProduct.get(item.productId) ?? []).map((p) => ({ ...p, supplierName: p.supplier.name })),
    );
    // Hàng có công nợ không tính vào ngưỡng miễn ship — cùng quy tắc với màn Gom đơn.
    if (!supplier || supplier.hasCredit) continue;
    supplierMeta.set(supplier.supplierId, {
      name: supplier.supplier.name,
      threshold: supplier.supplier.freeShipThreshold == null ? null : Number(supplier.supplier.freeShipThreshold),
    });
    const key = `${userId}|${supplier.supplierId}`;
    const bucket = byShopSupplier.get(key) ?? { amount: 0, codes: new Set<string>() };
    bucket.amount += Number(item.quantity) * Number(supplier.importPrice);
    bucket.codes.add(item.salesOrder.code);
    byShopSupplier.set(key, bucket);
  }

  for (const [key, bucket] of byShopSupplier) {
    const [userId, supplierId] = key.split("|") as [string, string];
    const meta = supplierMeta.get(supplierId)!;
    if (meta.threshold == null || bucket.amount < meta.threshold) continue;
    findings.push({
      kind: "FREE_SHIP_READY",
      userId,
      supplierId,
      amount: Math.round(bucket.amount),
      title: `${shopName.get(userId)} đã đủ miễn ship với ${meta.name}`,
      reasons: [
        `Đơn đang mở tới ${meta.name}: ${Math.round(bucket.amount).toLocaleString("vi-VN")} đ ≥ ngưỡng ${meta.threshold.toLocaleString("vi-VN")} đ`,
        `Gọi luôn thay vì đợi tới ngày gọi — không mất thêm tiền ship`,
        `Đơn góp vào: ${[...bucket.codes].sort((a, b) => a.localeCompare(b)).join(", ")}`,
      ],
    });
  }

  // --- 4. Hôm nay đúng mốc gọi ---
  const today = new Date(now.getTime() + 7 * 3_600_000).getUTCDate();
  if (isCreditOrderDay(now)) {
    for (const shop of shops) {
      const creditProducts = thresholds.filter((t) => {
        if (t.userId !== shop.id || !t.product.active || t.product.orderCadence === "CENTRAL") return false;
        const { supplier } = pickPrioritySupplier(
          (pricesByProduct.get(t.productId) ?? []).map((p) => ({ ...p, supplierName: p.supplier.name })),
        );
        return resolveCadence(t.product.orderCadence, supplier?.hasCredit ?? false) === "CREDIT_TWICE_MONTHLY";
      });
      if (creditProducts.length === 0) continue;
      findings.push({
        kind: "ORDER_DUE",
        userId: shop.id,
        daysToOrder: 0,
        title: `${shop.name}: hôm nay (ngày ${today}) là mốc gọi hàng công nợ`,
        reasons: [
          `${creditProducts.length} hàng hoá có công nợ cần gọi hôm nay`,
          "Mốc gọi hàng công nợ là ngày 15 và 30 — lô này phải phủ tới mốc sau",
          "Vào Order nhanh của quán để tạo đơn, hoặc dùng phần gợi ý đặt hàng",
        ],
      });
    }
  }

  // Gấp nhất lên đầu: ít ngày còn lại nhất. Dòng không có daysLeft (đủ ngưỡng ship, tới mốc gọi) xuống sau.
  findings.sort((a, b) => {
    const da = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const db = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return da - db || a.title.localeCompare(b.title);
  });

  return { findings, shopCount: shops.length };
}

/**
 * Chạy một lượt và GHI KẾT QUẢ.
 *
 * Chạy lại cùng một ngày thì **ghi đè**, không nhân đôi: GitHub Actions có thể chạy lại khi lỗi mạng.
 * Khoá theo `businessDate` (unique) làm việc đó.
 */
export async function runDailyWatch(options: {
  triggeredBy: "CRON" | "MANUAL";
  triggeredById?: string;
  now?: Date;
  /** Bỏ qua bước bắn thông báo — dùng khi admin bấm chạy lại để xem, không phải lượt tối. */
  skipNotify?: boolean;
}) {
  const now = options.now ?? new Date();
  const businessDate = vnBusinessDate(now);

  const run = await prisma.dailyWatchRun.upsert({
    where: { businessDate: parseBusinessDate(businessDate) },
    create: {
      businessDate: parseBusinessDate(businessDate),
      triggeredBy: options.triggeredBy,
      triggeredById: options.triggeredById,
    },
    update: {
      startedAt: now,
      finishedAt: null,
      error: null,
      triggeredBy: options.triggeredBy,
      triggeredById: options.triggeredById ?? null,
    },
  });

  try {
    const { findings, shopCount } = await computeDailyWatch(now);

    await prisma.$transaction(
      async (tx) => {
        await tx.dailyWatchFinding.deleteMany({ where: { runId: run.id } });
        if (findings.length > 0) {
          await tx.dailyWatchFinding.createMany({
            data: findings.map((f) => ({
              runId: run.id,
              kind: f.kind,
              userId: f.userId,
              productId: f.productId ?? null,
              supplierId: f.supplierId ?? null,
              fromUserId: f.fromUserId ?? null,
              daysLeft: f.daysLeft ?? null,
              daysToOrder: f.daysToOrder ?? null,
              quantity: f.quantity ?? null,
              amount: f.amount ?? null,
              freeTransfer: f.freeTransfer ?? false,
              title: f.title,
              reasons: f.reasons as unknown as Prisma.InputJsonValue,
            })),
          });
        }
        await tx.dailyWatchRun.update({
          where: { id: run.id },
          data: { finishedAt: new Date(), shopCount },
        });
      },
      // Một lượt có thể sinh vài trăm dòng; 5 giây mặc định không đủ khi chạy qua Neon.
      { timeout: 30000 },
    );

    // Thông báo SAU khi ghi DB xong, KHÔNG await — xem chú thích notifyInBackground.
    if (!options.skipNotify) {
      const shortfalls = findings.filter((f) => f.kind === "SHORTFALL");
      const transfers = findings.filter((f) => f.kind === "TRANSFER");
      // Chỉ báo việc GẤP: hết trước cả ngày chuyển miễn phí gần nhất.
      const urgent = shortfalls.filter((f) => (f.daysLeft ?? 99) <= nextFreeTransferDay(now).daysAway + 1);
      if (urgent.length > 0) {
        const shops = await prisma.user.findMany({
          where: { id: { in: urgent.map((f) => f.userId) } },
          select: { id: true, name: true },
        });
        const products = await prisma.product.findMany({
          where: { id: { in: urgent.map((f) => f.productId!).filter(Boolean) } },
          select: { id: true, name: true },
        });
        dailyWatchNotifications.runningOut(
          urgent.map((f) => ({
            shopName: shops.find((s) => s.id === f.userId)?.name ?? "?",
            productName: products.find((p) => p.id === f.productId)?.name ?? "?",
            daysLeft: f.daysLeft ?? 0,
          })),
        );
      }
      if (transfers.length > 0) {
        dailyWatchNotifications.transferSuggested(transfers.length, transfers.filter((f) => f.freeTransfer).length);
      }
    }

    return getDailyWatchRun(businessDate);
  } catch (err) {
    // Ghi lỗi vào chính bản ghi lượt chạy: GitHub Actions có nhật ký riêng, nhưng admin mở màn cũng phải
    // thấy được là lượt tối qua đã hỏng — màn trắng trông y như "không có việc gì".
    await prisma.dailyWatchRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}

const findingInclude = {
  user: { select: { id: true, name: true } },
  fromUser: { select: { id: true, name: true } },
  product: { select: { id: true, code: true, name: true, unit: { select: { name: true } } } },
  supplier: { select: { id: true, name: true } },
};

/** Lượt chạy của một ngày, kèm mọi việc đã nêu. Bỏ trống ngày thì lấy lượt gần nhất. */
export async function getDailyWatchRun(businessDate?: string) {
  const run = businessDate
    ? await prisma.dailyWatchRun.findFirst({
        // findFirst chứ không findUnique: khoá có cột @db.Date, xem chú thích trong CLAUDE.md.
        where: { businessDate: parseBusinessDate(businessDate) },
        include: { findings: { include: findingInclude }, triggeredBy_: { select: { id: true, name: true } } },
      })
    : await prisma.dailyWatchRun.findFirst({
        orderBy: { businessDate: "desc" },
        include: { findings: { include: findingInclude }, triggeredBy_: { select: { id: true, name: true } } },
      });
  if (!run) return null;

  // Sắp lại theo mức gấp ở tầng đọc: createMany không giữ thứ tự, và thứ tự là thông tin chính của màn.
  run.findings.sort((a, b) => {
    const da = a.daysLeft == null ? Number.POSITIVE_INFINITY : Number(a.daysLeft);
    const db = b.daysLeft == null ? Number.POSITIVE_INFINITY : Number(b.daysLeft);
    return da - db || a.title.localeCompare(b.title);
  });
  return run;
}
