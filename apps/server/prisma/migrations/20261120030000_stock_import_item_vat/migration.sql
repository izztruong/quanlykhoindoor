-- AlterTable
ALTER TABLE "StockImportItem" ADD COLUMN     "vatPercent" DECIMAL(5,2);

-- Phiếu đã có: chốt VAT% hiện hành của danh mục vào từng dòng.
UPDATE "StockImportItem" i SET "vatPercent" = p."vatPercent" FROM "Product" p WHERE p.id = i."productId";
