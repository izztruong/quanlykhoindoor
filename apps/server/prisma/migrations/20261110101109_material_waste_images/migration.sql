-- CreateTable
CREATE TABLE "MaterialWasteImage" (
    "id" TEXT NOT NULL,
    "materialWasteId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialWasteImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialWasteImage_objectKey_key" ON "MaterialWasteImage"("objectKey");

-- CreateIndex
CREATE INDEX "MaterialWasteImage_materialWasteId_idx" ON "MaterialWasteImage"("materialWasteId");

-- AddForeignKey
ALTER TABLE "MaterialWasteImage" ADD CONSTRAINT "MaterialWasteImage_materialWasteId_fkey" FOREIGN KEY ("materialWasteId") REFERENCES "MaterialWaste"("id") ON DELETE CASCADE ON UPDATE CASCADE;
