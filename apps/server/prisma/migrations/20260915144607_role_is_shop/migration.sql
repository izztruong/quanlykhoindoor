-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "isShop" BOOLEAN NOT NULL DEFAULT false;

-- Vai trò "Quán" có sẵn là quán; admin và vai trò tạo sau mặc định không phải quán.
UPDATE "Role" SET "isShop" = true WHERE "id" = 'role_staff';
