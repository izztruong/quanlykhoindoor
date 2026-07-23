import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db";
import { requireRole, type AuthUser } from "../middleware/auth";
import { HttpError } from "./httpError";
import { parsePagination } from "./pagination";

type Delegate = {
  findMany: (args: any) => Promise<any[]>;
  count: (args: any) => Promise<number>;
  findUnique: (args: any) => Promise<any>;
  create: (args: any) => Promise<any>;
  createMany?: (args: any) => Promise<unknown>;
  update: (args: any) => Promise<any>;
  delete: (args: any) => Promise<any>;
};

interface CrudOptions {
  createSchema: z.ZodType<any>;
  updateSchema: z.ZodType<any>;
  searchFields?: string[];
  orderBy?: Record<string, "asc" | "desc">;
  include?: Record<string, unknown>;
  /** Roles allowed to create/update/delete. Read (GET) stays open to anyone authenticated. */
  writeRoles?: AuthUser["role"][];
  /**
   * Enables POST /bulk-import, upserting rows by this unique field (e.g.
   * "code"): existing values are updated in place, new ones are created.
   * Batched (one findMany + one createMany + concurrent updates) rather than
   * one findUnique+upsert per row, which matters once files run into the
   * hundreds of rows.
   */
  bulkImportKey?: string;
  /** Exact-match query filters allowed via ?field=value (e.g. productGroupId, type). */
  filterFields?: string[];
  /** Which of filterFields are actual Boolean columns — their "true"/"false" query string is coerced accordingly. */
  booleanFilterFields?: string[];
}

/**
 * Builds a plain REST CRUD router (list/detail/create/update/delete) for a
 * simple master-data model. Kept generic on purpose: catalog resources
 * (warehouses, product groups, units, suppliers, customers, products) all
 * share the exact same shape, so adding a new one is a 5-line file, not a
 * copy-pasted controller.
 */
export function createCrudRouter(delegate: Delegate, options: CrudOptions): Router {
  const router = Router();
  const orderBy = options.orderBy ?? { name: "asc" };
  const writeGuard = options.writeRoles ? [requireRole(...options.writeRoles)] : [];

  router.get("/", async (req, res) => {
    const { search, ...queryFields } = req.query as Record<string, string>;
    const { skip, take, page, pageSize } = parsePagination(req, 100);
    const searchWhere =
      search && options.searchFields?.length
        ? { OR: options.searchFields.map((field) => ({ [field]: { contains: search, mode: "insensitive" } })) }
        : {};
    const filterWhere: Record<string, unknown> = {};
    for (const field of options.filterFields ?? []) {
      if (!queryFields[field]) continue;
      filterWhere[field] = options.booleanFilterFields?.includes(field) ? queryFields[field] === "true" : queryFields[field];
    }
    const where = { ...searchWhere, ...filterWhere };

    const [items, total] = await Promise.all([
      delegate.findMany({ where, orderBy, skip, take, include: options.include }),
      delegate.count({ where }),
    ]);

    res.json({ items, total, page, pageSize });
  });

  router.get("/:id", async (req, res) => {
    const item = await delegate.findUnique({ where: { id: req.params.id }, include: options.include });
    if (!item) throw new HttpError(404, "Không tìm thấy bản ghi");
    res.json(item);
  });

  router.post("/", ...writeGuard, async (req, res) => {
    const data = options.createSchema.parse(req.body);
    const item = await delegate.create({ data, include: options.include });
    res.status(201).json(item);
  });

  router.put("/:id", ...writeGuard, async (req, res) => {
    const data = options.updateSchema.parse(req.body);
    const item = await delegate.update({ where: { id: req.params.id }, data, include: options.include });
    res.json(item);
  });

  router.delete("/:id", ...writeGuard, async (req, res) => {
    await delegate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  });

  if (options.bulkImportKey) {
    const key = options.bulkImportKey;
    const bulkImportSchema = z.object({ items: z.array(options.createSchema).min(1) });

    router.post("/bulk-import", ...writeGuard, async (req, res) => {
      const { items } = bulkImportSchema.parse(req.body);

      // If the same key appears twice in the file, the last occurrence wins —
      // matches what a row-by-row upsert would have done.
      const byKey = new Map(items.map((item: any) => [item[key], item]));
      const dedupedItems = Array.from(byKey.values());

      const existing = await delegate.findMany({
        where: { [key]: { in: dedupedItems.map((item: any) => item[key]) } },
        select: { [key]: true },
      });
      const existingKeys = new Set(existing.map((row: any) => row[key]));

      const toCreate = dedupedItems.filter((item: any) => !existingKeys.has(item[key]));
      const toUpdate = dedupedItems.filter((item: any) => existingKeys.has(item[key]));

      // Batched into one transaction on a single connection instead of firing
      // one independent update per row: keeps a large import atomic (all rows
      // land or none do) and avoids saturating the connection pool.
      const operations: Promise<unknown>[] = [];
      if (toCreate.length > 0) {
        if (!delegate.createMany) throw new HttpError(500, "Bulk import không được hỗ trợ cho tài nguyên này");
        operations.push(delegate.createMany({ data: toCreate }));
      }
      for (const item of toUpdate) {
        operations.push(delegate.update({ where: { [key]: item[key] }, data: item }));
      }
      if (operations.length > 0) await prisma.$transaction(operations as any);

      res.json({ created: toCreate.length, updated: toUpdate.length });
    });
  }

  return router;
}
