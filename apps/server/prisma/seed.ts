import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@quanly.local" },
    update: {},
    create: { email: "admin@quanly.local", passwordHash, name: "Quản trị viên", role: "ADMIN" },
  });

  const unitDefs = [
    { code: "KG", name: "Kg" },
    { code: "TUI", name: "Túi" },
    { code: "CHAI", name: "Chai" },
    { code: "HOP", name: "Hộp" },
  ];
  const units = await Promise.all(
    unitDefs.map((u) => prisma.unit.upsert({ where: { code: u.code }, update: {}, create: u })),
  );
  const unitByCode = Object.fromEntries(units.map((u) => [u.code, u]));

  const groupDefs = [
    { code: "COFFE", name: "COFFEE" },
    { code: "BOTNTOPPING", name: "BOT&TOPPING" },
    { code: "SIRONMUT", name: "SIRO VÀ MỨT" },
    { code: "SUANKEMBEO", name: "SỮA & KEM BÉO" },
  ];
  const groups = await Promise.all(
    groupDefs.map((g) => prisma.productGroup.upsert({ where: { code: g.code }, update: {}, create: g })),
  );
  const groupByCode = Object.fromEntries(groups.map((g) => [g.code, g]));

  const warehouse = await prisma.warehouse.upsert({
    where: { code: "INDOOR" },
    update: {},
    create: { code: "INDOOR", name: "INDOOR COFFEE", address: "Tầng 1" },
  });
  await prisma.warehouse.upsert({
    where: { code: "OUTDOOR" },
    update: {},
    create: { code: "OUTDOOR", name: "OUTDOOR COFFEE", address: "Sân vườn" },
  });

  const supplier = await prisma.supplier.upsert({
    where: { code: "NCC001" },
    update: {},
    create: { code: "NCC001", name: "Công ty TNHH Cà phê Việt", phone: "0900000000" },
  });
  const customer = await prisma.customer.upsert({
    where: { code: "KH001" },
    update: {},
    create: { code: "KH001", name: "Khách lẻ", phone: "0911111111" },
  });

  const productDefs = [
    { code: "5Y4VAAAK5JAT", name: "Labon mãng cầu", unit: "CHAI", group: "SIRONMUT", cost: 85000 },
    { code: "BO0001", name: "Bột sữa", unit: "KG", group: "BOTNTOPPING", cost: 65000 },
    { code: "BO0005", name: "Bột Phô Mai", unit: "TUI", group: "BOTNTOPPING", cost: 120000 },
    { code: "BO0007", name: "Bột Cacao", unit: "KG", group: "BOTNTOPPING", cost: 150000 },
    { code: "BO0008", name: "Bột tạo màng vị muối biển", unit: "TUI", group: "SUANKEMBEO", cost: 95000 },
    { code: "BO0010", name: "Bột rau câu GTP", unit: "TUI", group: "SUANKEMBEO", cost: 45000 },
    { code: "CF0001", name: "Robusta bột", unit: "KG", group: "COFFE", cost: 180000 },
    { code: "CF0002", name: "Robusta hạt", unit: "KG", group: "COFFE", cost: 175000 },
    { code: "CF0003", name: "Arabica", unit: "KG", group: "COFFE", cost: 220000 },
    { code: "CF0004", name: "Exotic", unit: "KG", group: "COFFE", cost: 260000 },
  ];

  const products: Awaited<ReturnType<typeof prisma.product.upsert>>[] = [];
  for (const p of productDefs) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: {
        code: p.code,
        name: p.name,
        unitId: unitByCode[p.unit].id,
        productGroupId: groupByCode[p.group].id,
        costPrice: p.cost,
      },
    });
    products.push(product);
  }
  const findProduct = (code: string) => products.find((p) => p.code === code)!;

  const openingQuantities: Record<string, number> = {
    "5Y4VAAAK5JAT": 1,
    BO0001: 25,
    BO0005: 11,
    BO0007: 3,
    BO0008: 1,
    CF0001: 62,
    CF0002: 7,
    CF0003: 25,
    CF0004: 1,
  };

  const importQuantitiesInPeriod: Record<string, number> = {
    BO0001: 36,
    BO0005: 10,
    BO0008: 8,
    BO0010: 60,
    CF0002: 30,
    CF0003: 15,
    CF0004: 26,
  };

  const beforePeriod = new Date("2026-05-15T08:00:00Z");

  await prisma.stockImport.upsert({
    where: { code: "PN-OPENING-SEED" },
    update: {},
    create: {
      code: "PN-OPENING-SEED",
      type: "PURCHASE",
      transactionAt: beforePeriod,
      form: "CASH",
      status: "COMPLETED",
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      note: "Nhập đầu kỳ (seed)",
      items: {
        create: Object.entries(openingQuantities).map(([code, qty]) => {
          const product = findProduct(code);
          return {
            productId: product.id,
            quantity: qty,
            costPrice: product.costPrice,
            costAmount: qty * Number(product.costPrice),
          };
        }),
      },
    },
  });

  await prisma.stockImport.upsert({
    where: { code: "PN-JUNE-SEED" },
    update: {},
    create: {
      code: "PN-JUNE-SEED",
      type: "PURCHASE",
      transactionAt: new Date("2026-06-10T08:00:00Z"),
      form: "BANK_TRANSFER",
      status: "COMPLETED",
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      note: "Nhập hàng tháng 6 (seed)",
      items: {
        create: Object.entries(importQuantitiesInPeriod).map(([code, qty]) => {
          const product = findProduct(code);
          return {
            productId: product.id,
            quantity: qty,
            costPrice: product.costPrice,
            costAmount: qty * Number(product.costPrice),
          };
        }),
      },
    },
  });

  await prisma.stockExport.upsert({
    where: { code: "PX-JUNE-SEED" },
    update: {},
    create: {
      code: "PX-JUNE-SEED",
      type: "SALE",
      transactionAt: new Date("2026-06-15T10:00:00Z"),
      form: "CASH",
      status: "COMPLETED",
      warehouseId: warehouse.id,
      customerId: customer.id,
      note: "Xuất bán (seed)",
      items: {
        create: [
          {
            productId: findProduct("CF0003").id,
            quantity: 5,
            costPrice: findProduct("CF0003").costPrice,
            costAmount: 5 * Number(findProduct("CF0003").costPrice),
          },
          {
            productId: findProduct("BO0001").id,
            quantity: 8,
            costPrice: findProduct("BO0001").costPrice,
            costAmount: 8 * Number(findProduct("BO0001").costPrice),
          },
        ],
      },
    },
  });

  console.log("Seed hoàn tất. Đăng nhập với admin@quanly.local / admin123");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
