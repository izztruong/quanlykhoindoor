-- CreateIndex
CREATE INDEX "InventoryCountItem_productId_idx" ON "InventoryCountItem"("productId");

-- CreateIndex
CREATE INDEX "SalesOrderItem_productId_idx" ON "SalesOrderItem"("productId");

-- CreateIndex
CREATE INDEX "StockCheckItem_productId_idx" ON "StockCheckItem"("productId");
