import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "./apiClient";
import { pushToast } from "./toastBus";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Mọi mutation trong app (tạo/sửa/xoá/đổi trạng thái) đều là một lần "lưu" — báo kết quả
        // tập trung ở đây thay vì gắn toast vào từng chỗ gọi. Giống hệt bên web.
        mutationCache: new MutationCache({
          // `meta.silent` cho thao tác nền không phải "lưu" (đánh dấu đã đọc, gạt công tắc) — báo
          // "Thành công" mỗi lần chạm vào một thông báo thì chỉ gây nhiễu. Lỗi thì vẫn báo.
          onSuccess: (_data, _variables, _context, mutation) => {
            if (!mutation.meta?.silent) pushToast("success", "Thành công");
          },
          onError: (error) =>
            pushToast("error", error instanceof ApiError ? error.message : "Có lỗi xảy ra, vui lòng thử lại"),
        }),
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
