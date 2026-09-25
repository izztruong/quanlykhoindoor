-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "leadDays" INTEGER;

-- CreateTable
CREATE TABLE "OrderScheduleDay" (
    "weekday" INTEGER NOT NULL,

    CONSTRAINT "OrderScheduleDay_pkey" PRIMARY KEY ("weekday")
);
