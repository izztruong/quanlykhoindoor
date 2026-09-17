import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import type { PagedResult } from "@/types";

export const LIST_PAGE_SIZE = 20;

/**
 * Danh sách phân trang dùng chung cho mọi màn danh sách. Vẫn lấy 20 dòng mỗi lượt như bản web,
 * chỉ khác là cuộn tới đâu tải tới đó thay vì bấm số trang — trên điện thoại thanh phân trang
 * chiếm chỗ mà bấm cũng khó.
 */
export function useInfiniteList<T>(
  key: unknown[],
  path: string,
  params: Record<string, string | number | undefined> = {},
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey: [...key, params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PagedResult<T>>(path, { ...params, page: pageParam, pageSize: LIST_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) =>
      pages.length * LIST_PAGE_SIZE < lastPage.total ? pages.length + 1 : undefined,
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
  };
}
