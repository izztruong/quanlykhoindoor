-- CreateTable
CREATE TABLE "SalesOrderItemImage" (
    "id" TEXT NOT NULL,
    "salesOrderItemId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderItemImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrderItemImage_objectKey_key" ON "SalesOrderItemImage"("objectKey");

-- CreateIndex
CREATE INDEX "SalesOrderItemImage_salesOrderItemId_idx" ON "SalesOrderItemImage"("salesOrderItemId");

-- AddForeignKey
ALTER TABLE "SalesOrderItemImage" ADD CONSTRAINT "SalesOrderItemImage_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
