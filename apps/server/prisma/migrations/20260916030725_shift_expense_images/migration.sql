-- CreateTable
CREATE TABLE "ShiftExpenseImage" (
    "id" TEXT NOT NULL,
    "shiftExpenseId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftExpenseImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftExpenseImage_objectKey_key" ON "ShiftExpenseImage"("objectKey");

-- CreateIndex
CREATE INDEX "ShiftExpenseImage_shiftExpenseId_idx" ON "ShiftExpenseImage"("shiftExpenseId");

-- AddForeignKey
ALTER TABLE "ShiftExpenseImage" ADD CONSTRAINT "ShiftExpenseImage_shiftExpenseId_fkey" FOREIGN KEY ("shiftExpenseId") REFERENCES "ShiftExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
