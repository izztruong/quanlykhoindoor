-- CreateTable
CREATE TABLE "OtherExpense" (
    "id" TEXT NOT NULL,
    "spentAt" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtherExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherExpenseImage" (
    "id" TEXT NOT NULL,
    "otherExpenseId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherExpenseImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtherExpense_createdById_spentAt_idx" ON "OtherExpense"("createdById", "spentAt");

-- CreateIndex
CREATE UNIQUE INDEX "OtherExpenseImage_objectKey_key" ON "OtherExpenseImage"("objectKey");

-- CreateIndex
CREATE INDEX "OtherExpenseImage_otherExpenseId_idx" ON "OtherExpenseImage"("otherExpenseId");

-- AddForeignKey
ALTER TABLE "OtherExpense" ADD CONSTRAINT "OtherExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherExpenseImage" ADD CONSTRAINT "OtherExpenseImage_otherExpenseId_fkey" FOREIGN KEY ("otherExpenseId") REFERENCES "OtherExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
