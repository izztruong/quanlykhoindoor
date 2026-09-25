/**
 * BACKTEST dự báo doanh số trên dữ liệu POS đã nạp.
 *
 * Mục đích: trả lời "mô hình có đúng không" bằng con số, TRƯỚC khi ai dựa vào nó để đặt hàng — thay vì
 * phát hành rồi đợi ba tháng. Chỉ đọc, không ghi gì.
 *
 *   npx tsx scripts/backtest-forecast.ts <userId> [--train-weeks 6] [--test-weeks 2]
 *
 * Ba phép đo:
 *   1. Dự báo theo THỨ (mức ngày)   — huấn luyện trên phần train, đo sai số trên phần test.
 *   2. Dự báo theo THỨ × CA         — cùng cách, để thấy nhiễu tăng bao nhiêu khi chia nhỏ theo ca.
 *   3. Đối chiếu hai nguồn độc lập  — tiêu hao suy từ (doanh số × công thức BOM) so với actualUsed của
 *      Check Cost. Lệch nhiều nghĩa là công thức BOM sai hoặc có thất thoát, và cần biết điều đó
 *      trước khi dựa vào nó.
 *
 * Đây là script phân tích một lần, cố ý để ở scripts/ chứ không phải src/: nó không thuộc đường chạy
 * của API và không được import từ đâu.
 */
import { prisma } from "../src/config/db";
import { sliceByShift } from "../src/modules/posSales/shiftSlicing";

const DAY_MS = 86_400_000;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Thứ theo ISO: 1 = Thứ 2 … 7 = Chủ nhật. */
function isoWeekday(dateKeyString: string): number {
  const day = new Date(`${dateKeyString}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Sai số tuyệt đối trung bình chia cho mức trung bình thực tế (WAPE). Dùng WAPE chứ không phải MAPE:
 * MAPE chia cho từng giá trị thực tế nên một ngày bán 1 ly làm sai số vọt lên vô nghĩa.
 */
function wape(pairs: { actual: number; predicted: number }[]): number | null {
  const totalActual = pairs.reduce((sum, p) => sum + p.actual, 0);
  if (totalActual <= 0) return null;
  const totalError = pairs.reduce((sum, p) => sum + Math.abs(p.actual - p.predicted), 0);
  return totalError / totalActual;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

async function main() {
  const userId = process.argv[2];
  if (!userId || userId.startsWith("--")) {
    console.error("Cần userId của quán. Ví dụ: npx tsx scripts/backtest-forecast.ts <userId> --train-weeks 6 --test-weeks 2");
    process.exit(1);
  }
  const trainWeeks = arg("train-weeks", 6);
  const testWeeks = arg("test-weeks", 2);

  const cells = await prisma.posSaleHour.findMany({
    where: { userId },
    select: { soldOn: true, hour: true, finishedGoodItemId: true, quantity: true },
    orderBy: { soldOn: "asc" },
  });
  if (cells.length === 0) {
    console.error("Quán này chưa có dữ liệu doanh số POS. Nhập ở Quản trị › Doanh số POS trước.");
    process.exit(1);
  }

  const first = cells[0].soldOn;
  const last = cells[cells.length - 1].soldOn;
  const spanDays = Math.round((last.getTime() - first.getTime()) / DAY_MS) + 1;
  console.log(`Dữ liệu: ${dateKey(first)} → ${dateKey(last)} (${spanDays} ngày, ${cells.length} ô giờ×món)`);

  const needDays = (trainWeeks + testWeeks) * 7;
  if (spanDays < needDays) {
    console.log(
      `\n⚠ Chỉ có ${spanDays} ngày nhưng cần ${needDays} ngày cho ${trainWeeks} tuần huấn luyện + ${testWeeks} tuần kiểm.`,
    );
    console.log("  Giảm --train-weeks / --test-weeks, hoặc nhập thêm dữ liệu quá khứ.");
    process.exit(1);
  }

  // Cắt theo mốc thời gian: phần test là `testWeeks` tuần CUỐI, train là `trainWeeks` tuần ngay trước đó.
  const testStart = new Date(last.getTime() - (testWeeks * 7 - 1) * DAY_MS);
  const trainStart = new Date(testStart.getTime() - trainWeeks * 7 * DAY_MS);
  const inTrain = (d: Date) => d >= trainStart && d < testStart;
  const inTest = (d: Date) => d >= testStart;
  console.log(`Huấn luyện: ${dateKey(trainStart)} → hôm trước ${dateKey(testStart)} · Kiểm: ${dateKey(testStart)} → ${dateKey(last)}`);

  // ---------- 1. Dự báo theo THỨ, mức ngày ----------
  const dayTotals = new Map<string, Map<string, number>>(); // dateKey → itemId → qty
  for (const cell of cells) {
    const key = dateKey(cell.soldOn);
    const byItem = dayTotals.get(key) ?? new Map<string, number>();
    byItem.set(cell.finishedGoodItemId, (byItem.get(cell.finishedGoodItemId) ?? 0) + Number(cell.quantity));
    dayTotals.set(key, byItem);
  }

  const trainByWeekdayItem = new Map<string, number[]>(); // `${weekday}|${itemId}` → các quan sát
  for (const [key, byItem] of dayTotals) {
    if (!inTrain(new Date(`${key}T12:00:00.000Z`))) continue;
    for (const [itemId, qty] of byItem) {
      const k = `${isoWeekday(key)}|${itemId}`;
      const list = trainByWeekdayItem.get(k) ?? [];
      list.push(qty);
      trainByWeekdayItem.set(k, list);
    }
  }

  const dayPairs: { actual: number; predicted: number }[] = [];
  let dayMissingModel = 0;
  for (const [key, byItem] of dayTotals) {
    if (!inTest(new Date(`${key}T12:00:00.000Z`))) continue;
    for (const [itemId, qty] of byItem) {
      const observations = trainByWeekdayItem.get(`${isoWeekday(key)}|${itemId}`);
      if (!observations) {
        dayMissingModel++;
        continue;
      }
      dayPairs.push({ actual: qty, predicted: mean(observations) });
    }
  }
  const dayWape = wape(dayPairs);
  console.log(`\n1) Trung bình theo THỨ (mức ngày): ${dayPairs.length} cặp dự báo/thực tế`);
  console.log(`   WAPE = ${dayWape == null ? "không tính được" : `${(dayWape * 100).toFixed(1)}%`}`);
  if (dayMissingModel > 0) console.log(`   ${dayMissingModel} cặp bỏ qua vì phần huấn luyện chưa từng thấy (thứ × món) đó`);

  // ---------- 2. Dự báo theo THỨ × CA ----------
  const shifts = await prisma.shiftDefinition.findMany({ orderBy: { code: "asc" } });
  if (shifts.length === 0) {
    console.log("\n2) Bỏ qua mức CA: chưa khai khung giờ ca (Quản trị › Khung giờ ca).");
  } else {
    const shiftCells = sliceByShift(
      cells.map((c) => ({ ...c, quantity: Number(c.quantity) })),
      shifts,
    );

    const trainByShiftItem = new Map<string, number[]>();
    for (const cell of shiftCells) {
      if (!inTrain(new Date(`${cell.businessDate}T12:00:00.000Z`))) continue;
      const k = `${isoWeekday(cell.businessDate)}|${cell.shift}|${cell.finishedGoodItemId}`;
      const list = trainByShiftItem.get(k) ?? [];
      list.push(cell.quantity);
      trainByShiftItem.set(k, list);
    }

    const shiftPairs: { actual: number; predicted: number }[] = [];
    let shiftMissingModel = 0;
    for (const cell of shiftCells) {
      if (!inTest(new Date(`${cell.businessDate}T12:00:00.000Z`))) continue;
      const observations = trainByShiftItem.get(
        `${isoWeekday(cell.businessDate)}|${cell.shift}|${cell.finishedGoodItemId}`,
      );
      if (!observations) {
        shiftMissingModel++;
        continue;
      }
      shiftPairs.push({ actual: cell.quantity, predicted: mean(observations) });
    }
    const shiftWape = wape(shiftPairs);
    console.log(`\n2) Trung bình theo THỨ × CA: ${shiftPairs.length} cặp`);
    console.log(`   WAPE = ${shiftWape == null ? "không tính được" : `${(shiftWape * 100).toFixed(1)}%`}`);
    if (shiftMissingModel > 0) console.log(`   ${shiftMissingModel} cặp bỏ qua vì chưa từng thấy (thứ × ca × món) đó`);
    if (dayWape != null && shiftWape != null) {
      console.log(
        `   → chia theo ca làm sai số ${shiftWape > dayWape ? "TĂNG" : "GIẢM"} ${Math.abs((shiftWape - dayWape) * 100).toFixed(1)} điểm %`,
      );
      console.log("     Tăng nhiều thì giữ chế độ cố định thêm một thời gian, đừng bật dự báo theo ca.");
    }
  }

  // ---------- 3. Hai nguồn độc lập: doanh số × BOM  vs  Check Cost ----------
  const costCheck = await prisma.costCheck.findFirst({
    where: { userId, status: "ACTIVE", reportSnapshot: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { openingStockCheck: true, closingStockCheck: true },
  });
  if (!costCheck?.reportSnapshot) {
    console.log("\n3) Bỏ qua đối chiếu BOM: quán chưa có phiếu Check Cost nào có số liệu.");
  } else {
    const from = costCheck.openingStockCheck.checkedAt;
    const to = costCheck.closingStockCheck.checkedAt;
    console.log(`\n3) Đối chiếu với Check Cost ${costCheck.code} (${dateKey(from)} → ${dateKey(to)})`);

    const soldInPeriod = cells.filter((c) => c.soldOn >= from && c.soldOn <= to);
    if (soldInPeriod.length === 0) {
      console.log("   Không có doanh số POS trong kỳ của phiếu này — nhập dữ liệu phủ kỳ đó rồi chạy lại.");
    } else {
      const soldByItem = new Map<string, number>();
      for (const cell of soldInPeriod) {
        soldByItem.set(cell.finishedGoodItemId, (soldByItem.get(cell.finishedGoodItemId) ?? 0) + Number(cell.quantity));
      }

      const recipes = await prisma.finishedGoodRecipeItem.findMany({
        where: { finishedGoodItemId: { in: [...soldByItem.keys()] } },
        select: { finishedGoodItemId: true, productId: true, quantityPerUnit: true },
      });
      // Tiêu hao lý thuyết theo recipeUnit — cùng đơn vị với actualUsed trong snapshot.
      const theoreticalByProduct = new Map<string, number>();
      for (const recipe of recipes) {
        const sold = soldByItem.get(recipe.finishedGoodItemId) ?? 0;
        const used = sold * Number(recipe.quantityPerUnit);
        theoreticalByProduct.set(recipe.productId, (theoreticalByProduct.get(recipe.productId) ?? 0) + used);
      }

      const snapshot = costCheck.reportSnapshot as { rows?: { productId: string; name: string; actualUsed: number }[] };
      const rows = (snapshot.rows ?? []).filter((r) => theoreticalByProduct.has(r.productId));
      if (rows.length === 0) {
        console.log("   Không có nguyên liệu nào khớp giữa hai nguồn (kiểm lại ánh xạ món POS và công thức BOM).");
      } else {
        const compared = rows
          .map((r) => {
            const fromPos = theoreticalByProduct.get(r.productId)!;
            const fromCostCheck = Number(r.actualUsed);
            const gapPct = fromCostCheck > 0 ? (fromPos - fromCostCheck) / fromCostCheck : null;
            return { name: r.name, fromPos, fromCostCheck, gapPct };
          })
          .sort((a, b) => Math.abs(b.gapPct ?? 0) - Math.abs(a.gapPct ?? 0));

        console.log(`   ${compared.length} nguyên liệu so được. Lệch lớn nhất:`);
        for (const row of compared.slice(0, 10)) {
          const gap = row.gapPct == null ? "—" : `${(row.gapPct * 100).toFixed(0)}%`;
          console.log(
            `     ${row.name}: từ doanh số ${row.fromPos.toFixed(1)} · từ Check Cost ${row.fromCostCheck.toFixed(1)} · lệch ${gap}`,
          );
        }
        const median = compared
          .map((r) => Math.abs(r.gapPct ?? 0))
          .sort((a, b) => a - b)[Math.floor(compared.length / 2)];
        console.log(`   Lệch trung vị: ${(median * 100).toFixed(0)}%`);
        console.log("     Lệch lớn = công thức BOM không khớp thực tế pha chế, hoặc có thất thoát/rơi vãi không ghi phiếu.");
      }
    }
  }

  console.log("\nGhi kết quả vào docs/progress.md dạng con số, không phải cảm nhận.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
