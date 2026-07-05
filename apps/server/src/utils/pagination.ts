import type { Request } from "express";

export interface PaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function parsePagination(req: Request, defaultPageSize = 50): PaginationParams {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || defaultPageSize));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function parseDateRange(req: Request): { from?: Date; to?: Date } {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  if (to) to.setHours(23, 59, 59, 999);
  return { from, to };
}
