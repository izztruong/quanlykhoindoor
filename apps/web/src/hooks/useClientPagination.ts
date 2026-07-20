"use client";

import { useEffect, useMemo, useState } from "react";

/** Client-side pagination for lists whose data is already fetched in one request (no server paging). */
export function useClientPagination<T>(data: T[], initialPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return { page, pageSize, pageItems, total: data.length, setPage, onPageSizeChange };
}
