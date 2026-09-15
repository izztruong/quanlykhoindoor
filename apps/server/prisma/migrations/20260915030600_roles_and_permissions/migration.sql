-- Thay enum UserRole (ADMIN/STAFF) bằng vai trò tuỳ biến giữ danh sách mã quyền.
-- Hai vai trò khởi tạo tái hiện đúng quyền của ADMIN/STAFF trước đây, nên không tài khoản nào
-- đổi hành vi sau khi deploy. Dữ liệu phải chèn ở đây chứ không ở seed: Render chỉ chạy migrate deploy.

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Vai trò khởi tạo
INSERT INTO "Role" ("id", "name", "isSystem", "permissions", "updatedAt") VALUES
  ('role_admin', 'Quản trị viên', true, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('role_staff', 'Quán', false, ARRAY[
    'ORDERS.VIEW', 'ORDERS.ADD', 'ORDERS.RECEIVE',
    'STOCK_CHECKS.VIEW', 'STOCK_CHECKS.ADD',
    'MATERIAL_WASTE.VIEW', 'MATERIAL_WASTE.ADD',
    'SHIFT_EXPENSES.VIEW', 'SHIFT_EXPENSES.ADD', 'SHIFT_EXPENSES.EDIT', 'SHIFT_EXPENSES.DELETE'
  ]::TEXT[], CURRENT_TIMESTAMP);

-- Chuyển tài khoản sang vai trò tương ứng
ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
UPDATE "User" SET "roleId" = CASE WHEN "role" = 'ADMIN' THEN 'role_admin' ELSE 'role_staff' END;
ALTER TABLE "User" ALTER COLUMN "roleId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bỏ enum cũ
ALTER TABLE "User" DROP COLUMN "role";
DROP TYPE "UserRole";
