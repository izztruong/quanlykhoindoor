-- CreateTable
CREATE TABLE "ProductReorderThreshold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "minQuantity" DECIMAL(18,3) NOT NULL,
    "maxQuantity" DECIMAL(18,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReorderThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductReorderThreshold_userId_productId_key" ON "ProductReorderThreshold"("userId", "productId");

-- AddForeignKey
ALTER TABLE "ProductReorderThreshold" ADD CONSTRAINT "ProductReorderThreshold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReorderThreshold" ADD CONSTRAINT "ProductReorderThreshold_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
