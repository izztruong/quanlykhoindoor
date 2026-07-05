-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "StockTransactionStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockImportType" AS ENUM ('PURCHASE', 'CUSTOMER_RETURN', 'TRANSFER_IN', 'OTHER');

-- CreateEnum
CREATE TYPE "StockExportType" AS ENUM ('SALE', 'SUPPLIER_RETURN', 'TRANSFER_OUT', 'DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionForm" AS ENUM ('CASH', 'BANK_TRANSFER', 'DEBT', 'OTHER');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "productGroupId" TEXT NOT NULL,
    "costPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "StockImportType" NOT NULL DEFAULT 'PURCHASE',
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "form" "TransactionForm" NOT NULL DEFAULT 'CASH',
    "status" "StockTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "note" TEXT,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockImportItem" (
    "id" TEXT NOT NULL,
    "stockImportId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "costPrice" DECIMAL(18,2) NOT NULL,
    "costAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "StockImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockExport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "StockExportType" NOT NULL DEFAULT 'SALE',
    "transactionAt" TIMESTAMP(3) NOT NULL,
    "form" "TransactionForm" NOT NULL DEFAULT 'CASH',
    "status" "StockTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "note" TEXT,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "customerId" TEXT,
    "salesOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockExportItem" (
    "id" TEXT NOT NULL,
    "stockExportId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "costPrice" DECIMAL(18,2) NOT NULL,
    "costAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "StockExportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderItem" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "SalesOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryCountItem" (
    "id" TEXT NOT NULL,
    "inventoryCountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actualQuantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGroup_code_key" ON "ProductGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockImport_code_key" ON "StockImport"("code");

-- CreateIndex
CREATE INDEX "StockImport_warehouseId_transactionAt_idx" ON "StockImport"("warehouseId", "transactionAt");

-- CreateIndex
CREATE INDEX "StockImportItem_productId_idx" ON "StockImportItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockExport_code_key" ON "StockExport"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockExport_salesOrderId_key" ON "StockExport"("salesOrderId");

-- CreateIndex
CREATE INDEX "StockExport_warehouseId_transactionAt_idx" ON "StockExport"("warehouseId", "transactionAt");

-- CreateIndex
CREATE INDEX "StockExportItem_productId_idx" ON "StockExportItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_code_key" ON "SalesOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_code_key" ON "InventoryCount"("code");

-- CreateIndex
CREATE INDEX "InventoryCount_warehouseId_periodStart_periodEnd_idx" ON "InventoryCount"("warehouseId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountItem_inventoryCountId_productId_key" ON "InventoryCountItem"("inventoryCountId", "productId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productGroupId_fkey" FOREIGN KEY ("productGroupId") REFERENCES "ProductGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImport" ADD CONSTRAINT "StockImport_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImport" ADD CONSTRAINT "StockImport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImport" ADD CONSTRAINT "StockImport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportItem" ADD CONSTRAINT "StockImportItem_stockImportId_fkey" FOREIGN KEY ("stockImportId") REFERENCES "StockImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockImportItem" ADD CONSTRAINT "StockImportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExport" ADD CONSTRAINT "StockExport_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExport" ADD CONSTRAINT "StockExport_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExport" ADD CONSTRAINT "StockExport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExport" ADD CONSTRAINT "StockExport_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExportItem" ADD CONSTRAINT "StockExportItem_stockExportId_fkey" FOREIGN KEY ("stockExportId") REFERENCES "StockExport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockExportItem" ADD CONSTRAINT "StockExportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderItem" ADD CONSTRAINT "SalesOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCount" ADD CONSTRAINT "InventoryCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
