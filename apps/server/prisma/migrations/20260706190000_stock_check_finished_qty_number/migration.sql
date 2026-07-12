-- AlterTable: StockCheckFinishedItem.quantity text -> numeric (non-numeric
-- existing values, e.g. free-text notes, fall back to 0)
ALTER TABLE "StockCheckFinishedItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(18,3)
  USING (CASE WHEN "quantity" ~ '^[0-9]+(\.[0-9]+)?$' THEN "quantity"::decimal ELSE 0 END);
