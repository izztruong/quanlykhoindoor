# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Phần mềm quản lý kho cho chuỗi quán cà phê. Giao diện và mọi thông báo cho người dùng đều bằng tiếng Việt.

## Stack

| Tầng | Công nghệ |
|---|---|
| Web | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · TanStack Query + Table · react-hook-form + Zod · ExcelJS |
| API | Express 5 · TypeScript chạy trực tiếp qua `tsx` (không build) · Zod · JWT + bcrypt |
| DB | PostgreSQL 16 · Prisma 7 với adapter `@prisma/adapter-pg` |
| Hạ tầng | Vercel (web) + Render (API) + Neon (DB); Docker Compose cho local |

Monorepo nhưng **không dùng npm workspaces** — mỗi app tự `npm install` trong thư mục của nó.

## Cấu trúc thư mục

```
apps/server/src
  modules/<tên>/     routes + schemas + service của một nghiệp vụ
  utils/             crudFactory, deadlines, costCheckImpact, codeGenerator, tareWeight, pagination
  config/            env.ts, db.ts (Prisma client)
  middleware/        auth.ts (requireAuth, requireRole), error.ts
  generated/prisma   Prisma client sinh ra — gitignore
apps/server/prisma   schema.prisma, migrations/, seed.ts

apps/web/src
  app/(app)/         các trang sau đăng nhập
  app/print/         trang in, layout riêng
  components/        nhóm theo nghiệp vụ, cộng components/ui (Button, Input, Select, Modal…)
  hooks/             bọc TanStack Query quanh api-client
  lib/               api-client, format, dateRange, excelExport, query-client
  types/index.ts     kiểu dùng chung, khớp payload API
  proxy.ts           middleware Next 16 — hiện chỉ pass-through
```

## Lệnh

```bash
docker compose up -d              # PostgreSQL (container kho_postgres, db kho_db)
npm run dev                       # gốc: chạy song song server + web

# apps/server
npm run dev                       # tsx watch, cổng 4000
npm run typecheck
npm run prisma:migrate            # migrate dev
npm run prisma:seed
npx prisma generate

# apps/web
npm run dev                       # cổng 3000
npm run build
npm run lint
npx tsc --noEmit
```

Tài khoản seed: `admin@quanly.local` / `admin123`

### Không có test framework

Repo **không có** vitest/jest/playwright và **không có `npm test`**. Cách kiểm chứng đang dùng:

1. `npm run typecheck` (server) + `npx tsc --noEmit` (web) — bắt buộc trước khi commit.
2. Gọi thẳng API bằng `curl` với cookie đăng nhập.
3. Với logic thuần (tính hạn, tính ngày…): viết script `tsx` tạm ở `apps/server/`, chạy, rồi **xoá đi** — đừng để lại file rác.
4. Dữ liệu tạo ra khi thử phải dọn sạch sau khi xong.

## Quy ước đặt tên

- **Module server**: `modules/<camelCase>/<cùng tên>.routes.ts` + `.service.ts` + `.schemas.ts`. Chỉ tách `.service.ts` khi có logic nghiệp vụ thật — module danh mục thuần CRUD chỉ có `.routes.ts`.
- **Đường dẫn API**: kebab-case, số nhiều — `/api/sales-orders`, `/api/product-supplier-prices`.
- **Route web**: thư mục kebab-case trong `app/(app)/`.
- **Component**: thư mục camelCase theo nghiệp vụ, file PascalCase. Hậu tố `*Client.tsx` = component `"use client"` giữ state (`OrderDetailClient`, `StockCheckFormClient`); `*Shell.tsx` = khung dùng lại (`ReportPageShell`).
- **Hook**: `use<PascalCase>.ts`, mỗi file gom query + mutation của một nghiệp vụ.
- **`lib/`**: phần lớn camelCase (`dateRange.ts`, `excelExport.ts`), vài file cũ kebab (`api-client.ts`, `query-client.tsx`) — **không đồng nhất**, file mới dùng camelCase.
- **Prisma**: model PascalCase số ít, trường camelCase, giá trị enum SCREAMING_SNAKE.
- **Ngôn ngữ**: định danh trong code tiếng Anh; chuỗi hiển thị và thông báo lỗi trả về người dùng bằng tiếng Việt; chú thích trộn cả hai.

**Mã chứng từ** sinh qua `generateCode(prefix)`:

| | | | |
|---|---|---|---|
| `PN` nhập kho | `PX` xuất kho | `DH` đơn hàng | `KT` kiểm kê quán |
| `KK` kiểm kê kho | `PH` huỷ nguyên liệu | `DC` điều chuyển | `CC` Check Cost |

## Quyết định thiết kế đã chốt

Những điều dưới đây đều có lý do cụ thể — đổi mà không nắm lý do sẽ làm hỏng thứ khác.

### Xác thực và phân quyền

- **`next.config.ts` rewrite `/api/*` sang `API_ORIGIN`** để trình duyệt chỉ nói chuyện với một origin, giữ cookie xác thực ở dạng same-site (Safari ITP chặn cookie khác domain). Hệ quả khi gỡ lỗi: backend chết thì API trả **502 từ proxy**, không phải lỗi kết nối.
- **`proxy.ts` cố ý chỉ pass-through.** Chặn truy cập thật nằm ở `app/(app)/layout.tsx`, qua hook `useCurrentUser()` (`lib/auth.ts` → `/api/auth/me`) — middleware không đọc được cookie khác domain nên sẽ đá mọi request về `/login`. Lý do ghi sẵn trong file.
- **Hai tầng quyền**: `requireAuth` áp cho toàn bộ `/api` trong `app.ts`, rồi từng router gắn `requireRole("ADMIN")`. JWT nằm trong cookie, có `tokenVersion` để đổi mật khẩu là vô hiệu hoá ngay mọi phiên cũ.
- **Giới hạn theo chủ sở hữu ép ở server**: router ghi đè `createdById` bằng `req.user.id` thay vì tin tham số client gửi lên. Ẩn ô lọc trên giao diện chỉ là chuyện hiển thị, **không phải lớp bảo vệ**.

### Dữ liệu và nghiệp vụ

- **`utils/crudFactory.ts`** sinh nguyên router CRUD cho danh mục (`writeRoles`, `filterFields`, `bulkImportKey`, mặc định `orderBy: { name: "asc" }`). Thêm danh mục mới thì dùng nó, đừng viết tay.
- **Check Cost chốt cứng số liệu**: `CostCheck.reportSnapshot` ghi lúc tạo phiếu, nên sửa giá vốn hay công thức về sau không làm đổi phiếu đã tạo. Vì vậy khi sửa/xoá phiếu kiểm kê, huỷ, điều chuyển **phải gọi `utils/costCheckImpact.ts`** để cảnh báo admin tạo lại phiếu Check Cost bị ảnh hưởng.
- **Đánh dấu muộn chốt lúc tạo**: `dueAt`/`isLate` đóng dấu ngay khi tạo bản ghi, không tính lại lúc hiển thị — nhờ đó lọc được bằng SQL và đổi lịch không viết lại lịch sử. Kỳ của phiếu kiểm suy từ `checkedAt` (quán tự khai), còn hạn lấy từ lịch admin đặt; đo muộn bằng `createdAt` vì hai cột kia người dùng sửa được. Bản ghi chưa từng được đánh giá thì `dueAt = null` và hiển thị **chấm xám**, không phải xanh.
- **Include cho danh sách tách khỏi include cho chi tiết**: `salesOrderListInclude` cố ý nhẹ hơn `salesOrderDetailInclude`. Dùng chung từng làm payload danh sách phình lên 187 KB cho 20 đơn.
- **Độ trễ Neon**: gộp nhiều lệnh ghi thành một `UPDATE ... FROM (VALUES ...)` (xem `salesOrders.service.ts`) và đặt `$transaction(ops, { timeout: 20000 })` — mặc định 5 giây không đủ cho đơn nhiều dòng.

### Múi giờ — đã gây sai lệch dữ liệu thật

- **Không bao giờ cắt chuỗi ISO** để đổ vào ô `datetime-local`. Dùng `toDatetimeLocal()` trong `lib/dateRange.ts`. Cắt chuỗi khiến mốc thời gian **trừ mất 7 tiếng mỗi lần lưu**, và đó là ranh giới kỳ Check Cost.
- **Giờ cấu hình lưu bằng hai cột số nguyên** (giờ, phút), không phải `DateTime`, cùng lý do trên.
- **Mọi phép tính hạn đi qua hằng UTC+7** trong `utils/deadlines.ts` — Render chạy giờ UTC, để nguyên thì "22:00" thành 5 giờ sáng hôm sau.

### Migration

- `prisma migrate deploy` chạy theo **thứ tự tên thư mục**, không theo thứ tự tạo ra. Đặt tên bằng `date` của shell cho mốc **lệch 5 tiếng** so với đồng hồ UTC mà Prisma dùng, nên migration viết sau có thể mang tên sắp trước — đã từng khiến migration chèn dữ liệu chạy trước migration tạo cột.
- Migration nào **chèn hoặc sửa dữ liệu** thì bắt buộc thử `migrate deploy` trên một **database trắng** trước khi push. Máy dev áp migration theo thứ tự viết ra nên che mất lỗi này.
- **Không sửa file migration đã áp** — Prisma lưu checksum, deploy sẽ hỏng ở nơi migration đó đã chạy. Muốn chữa thì thêm migration mới.
- Dữ liệu khởi tạo bắt buộc phải nằm trong **migration**, không phải `prisma/seed.ts`: Render chỉ chạy `migrate deploy` lúc khởi động, không chạy seed.

### Prisma client trên Windows

`tsx watch` giữ khoá file khiến `prisma generate` **im lặng không cập nhật**, gây lỗi 500 rất khó lần. Dừng hết tiến trình server trước khi migrate/generate — và nhớ giết cả tiến trình con, không chỉ vỏ npm.

### Excel

- Mọi ô xuất ra đều qua `sanitizeExcelRow` (`lib/excelExport.ts`) — chống chèn công thức.
- Chỉ số cột gom vào **một hằng số dùng chung** cho mẫu trắng, xuất và nhập.
- Phần nhập **kiểm tra hàng tiêu đề trước khi đọc**. Đổi bố cục cột mà không kiểm sẽ đọc nhầm cột giá thành cột số lượng — phiếu trông vẫn bình thường nhưng số liệu đã hỏng.

## Deploy

Hai service Render: **`quanlykhoindoortest`** ← nhánh `staging`, **`quanlykhoindoor1`** ← `main`. Luồng làm việc: đẩy lên `staging` trước, merge fast-forward lên `main` sau.

- **Chẩn đoán sự cố thì kiểm staging trước**, rồi mới tới production.
- Header `x-render-routing` cho biết trạng thái (`hibernate-wake-error`, `no-deploy`); `status.render.com/api/v2/status.json` cho biết có phải sự cố toàn hệ thống Render không.
- Gói free ngủ sau 15 phút không hoạt động → request đầu tiên chờ 30–60 giây, và **không có gì đánh thức nên không dùng được job chạy nền**.
- Lệnh khởi động là `prisma migrate deploy && tsx src/index.ts` — **migration lỗi thì service không bao giờ lên**.

## Xem thêm

`apps/web/CLAUDE.md` — Next.js 16 có nhiều thay đổi phá vỡ so với dữ liệu huấn luyện; đọc `apps/web/node_modules/next/dist/docs/` trước khi viết code web.
