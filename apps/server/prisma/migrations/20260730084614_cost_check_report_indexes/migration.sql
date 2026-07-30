-- CreateIndex
CREATE INDEX "MaterialTransfer_fromUserId_transferAt_idx" ON "MaterialTransfer"("fromUserId", "transferAt");

-- CreateIndex
CREATE INDEX "MaterialTransfer_toUserId_transferAt_idx" ON "MaterialTransfer"("toUserId", "transferAt");

-- CreateIndex
CREATE INDEX "MaterialWaste_createdById_wasteAt_idx" ON "MaterialWaste"("createdById", "wasteAt");

-- CreateIndex
CREATE INDEX "SalesOrder_createdById_completedAt_idx" ON "SalesOrder"("createdById", "completedAt");
