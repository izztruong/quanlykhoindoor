import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { costChecksRouter } from "./modules/costChecks/costChecks.routes";
import { customersRouter } from "./modules/customers/customers.routes";
import { deadlinesRouter } from "./modules/deadlines/deadlines.routes";
import { finishedGoodItemsRouter } from "./modules/finishedGoodItems/finishedGoodItems.routes";
import { finishedGoodRecipesRouter } from "./modules/finishedGoodRecipes/finishedGoodRecipes.routes";
import { inventoryCountsRouter } from "./modules/inventoryCounts/inventoryCounts.routes";
import { materialTransfersRouter } from "./modules/materialTransfers/materialTransfers.routes";
import { materialWasteRouter } from "./modules/materialWaste/materialWaste.routes";
import { productGroupsRouter } from "./modules/productGroups/productGroups.routes";
import { productStockRouter } from "./modules/products/productStock.routes";
import { productsRouter } from "./modules/products/products.routes";
import { productSupplierPricesRouter } from "./modules/productSupplierPrices/productSupplierPrices.routes";
import { reorderThresholdsRouter } from "./modules/reorderThresholds/reorderThresholds.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { rolesRouter } from "./modules/roles/roles.routes";
import { salesOrdersRouter } from "./modules/salesOrders/salesOrders.routes";
import { shiftExpensesRouter } from "./modules/shiftExpenses/shiftExpenses.routes";
import { stockChecksRouter } from "./modules/stockChecks/stockChecks.routes";
import { stockExportsRouter } from "./modules/stock/stockExports.routes";
import { stockImportsRouter } from "./modules/stock/stockImports.routes";
import { suppliersRouter } from "./modules/suppliers/suppliers.routes";
import { unitsRouter } from "./modules/units/units.routes";
import { usersRouter } from "./modules/users/users.routes";
import { warehousesRouter } from "./modules/warehouses/warehouses.routes";

export const app = express();

app.use(cors({ origin: env.webOrigin, credentials: true }));
// Default 100kb limit is too small for bulk imports (e.g. ~1000 product rows).
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);

// Everything below requires an authenticated session.
app.use("/api", requireAuth);

// Phân quyền nằm trong từng router: mỗi route gắn requirePermission("RESOURCE") (xem
// modules/roles/permissions.ts), dữ liệu gắn với quán thu hẹp thêm qua ownerWhere/assertOwner.
// Ngoại lệ có chủ đích: GET danh mục tra cứu (kho, hàng hoá, khách hàng, đơn vị, nhóm, NCC, đồ thành
// phẩm, tồn kho, hạn nộp) chỉ cần đăng nhập, vì form tạo đơn/phiếu của quán phải đọc chúng.
app.use("/api/warehouses", warehousesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/product-stock", productStockRouter);
app.use("/api/finished-good-items", finishedGoodItemsRouter);
app.use("/api/reorder-thresholds", reorderThresholdsRouter);
app.use("/api/deadlines", deadlinesRouter);
app.use("/api/product-groups", productGroupsRouter);
app.use("/api/units", unitsRouter);
app.use("/api/suppliers", suppliersRouter);

app.use("/api/sales-orders", salesOrdersRouter);
app.use("/api/stock-checks", stockChecksRouter);
app.use("/api/material-waste", materialWasteRouter);
app.use("/api/shift-expenses", shiftExpensesRouter);

app.use("/api/stock-imports", stockImportsRouter);
app.use("/api/stock-exports", stockExportsRouter);
app.use("/api/product-supplier-prices", productSupplierPricesRouter);
app.use("/api/finished-good-recipes", finishedGoodRecipesRouter);
app.use("/api/cost-checks", costChecksRouter);
app.use("/api/material-transfers", materialTransfersRouter);
app.use("/api/inventory-counts", inventoryCountsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);

app.use(notFoundHandler);
app.use(errorHandler);
