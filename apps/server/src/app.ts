import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { requireAuth, requireRole } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { costChecksRouter } from "./modules/costChecks/costChecks.routes";
import { customersRouter } from "./modules/customers/customers.routes";
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
import { salesOrdersRouter } from "./modules/salesOrders/salesOrders.routes";
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

// Read access needed by staff placing orders (pick warehouse/customer/product);
// write access is still ADMIN-only (enforced inside each router via writeRoles).
app.use("/api/warehouses", warehousesRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/product-stock", productStockRouter);
app.use("/api/finished-good-items", finishedGoodItemsRouter);
// Read is self-scoped (or any user for admin) inside the router; write is admin-only inside the router.
app.use("/api/reorder-thresholds", reorderThresholdsRouter);

// Sales orders, phiếu kiểm (stock checks) và phiếu huỷ nguyên liệu: open to both roles, ownership-scoped for staff inside the router.
app.use("/api/sales-orders", salesOrdersRouter);
app.use("/api/stock-checks", stockChecksRouter);
app.use("/api/material-waste", materialWasteRouter);

// Staff has no use for these at all — admin only, both read and write.
app.use("/api/product-groups", requireRole("ADMIN"), productGroupsRouter);
app.use("/api/units", requireRole("ADMIN"), unitsRouter);
app.use("/api/suppliers", requireRole("ADMIN"), suppliersRouter);
app.use("/api/stock-imports", requireRole("ADMIN"), stockImportsRouter);
app.use("/api/stock-exports", requireRole("ADMIN"), stockExportsRouter);
app.use("/api/product-supplier-prices", requireRole("ADMIN"), productSupplierPricesRouter);
app.use("/api/finished-good-recipes", requireRole("ADMIN"), finishedGoodRecipesRouter);
app.use("/api/cost-checks", requireRole("ADMIN"), costChecksRouter);
app.use("/api/material-transfers", requireRole("ADMIN"), materialTransfersRouter);
app.use("/api/inventory-counts", requireRole("ADMIN"), inventoryCountsRouter);
app.use("/api/reports", requireRole("ADMIN"), reportsRouter);
app.use("/api/users", requireRole("ADMIN"), usersRouter);

app.use(notFoundHandler);
app.use(errorHandler);
