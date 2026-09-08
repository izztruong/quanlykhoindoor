-- CreateTable
CREATE TABLE "ShiftExpense" (
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

    CONSTRAINT "ShiftExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftExpense_createdById_spentAt_idx" ON "ShiftExpense"("createdById", "spentAt");

-- AddForeignKey
ALTER TABLE "ShiftExpense" ADD CONSTRAINT "ShiftExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
