"use client";

import { useMemo, useState } from "react";

/** Client-side pagination for lists whose data is already fetched in one request (no server paging). */
export function useClientPagination<T>(data: T[], initialPageSize = 20) {
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  // Kẹp lúc ĐỌC chứ không sửa state trong effect: danh sách ngắn lại (lọc bớt, xoá dòng) thì trang
  // đang xem có thể vượt quá số trang. Sửa bằng setState trong effect thì màn hình chớp một lượt
  // render rỗng trước khi nhảy về; tính dẫn xuất thì trang đúng ngay từ lượt render đầu.
  const page = Math.min(requestedPage, totalPages);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  function onPageSizeChange(size: number) {
    setPageSize(size);
    setRequestedPage(1);
  }

  return { page, pageSize, pageItems, total: data.length, setPage: setRequestedPage, onPageSizeChange };
}
