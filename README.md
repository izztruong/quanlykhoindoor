# Quản lý kho

Web app quản lý kho: Next.js (App Router) + Node.js/Express + PostgreSQL (Prisma).

## Cấu trúc

```
apps/server   Express + Prisma API (cổng 4000)
apps/web      Next.js frontend (cổng 3000)
docker-compose.yml   PostgreSQL cho local dev
```

## Chạy lần đầu

```powershell
docker compose up -d                      # bật PostgreSQL

cd apps/server
npm install
npm run prisma:migrate                    # tạo schema
npm run prisma:seed                       # dữ liệu mẫu + tài khoản admin
npm run dev                                # http://localhost:4000

cd ../web
npm install
npm run dev                                # http://localhost:3000
```

Đăng nhập: `admin@quanly.local` / `admin123`

## Cấu trúc chức năng

- **Kiểm toán**: Kiểm kê, Chi tiết/Tổng hợp xuất, Chi tiết/Tổng hợp nhập — báo cáo chỉ đọc, tổng hợp từ phiếu nhập/xuất kho.
- **Order**: quản lý đơn hàng bán; khi đơn chuyển trạng thái "Hoàn thành" hệ thống tự sinh phiếu xuất kho tương ứng.
- **Kho**: tạo phiếu nhập kho / xuất kho (nguồn dữ liệu cho báo cáo Kiểm toán).
- **Danh mục**: hàng hoá, nhóm hàng hoá, đơn vị tính, kho hàng, nhà cung cấp, khách hàng.

## Mở rộng

- Thêm resource danh mục mới: dùng `createCrudRouter` (`apps/server/src/utils/crudFactory.ts`) ở backend và `CatalogPage` (`apps/web/src/components/catalog/CatalogPage.tsx`) ở frontend — mỗi resource chỉ cần một file cấu hình vài dòng.
- Thêm báo cáo mới trong Kiểm toán: thêm hàm trong `apps/server/src/modules/reports/reports.service.ts` + route, rồi dùng `ReportPageShell` ở frontend.
- Thêm mục sidebar: sửa `apps/web/src/components/layout/nav-config.ts`.
