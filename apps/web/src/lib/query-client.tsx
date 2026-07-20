"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "./api-client";
import { pushToast } from "./toastBus";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        // Every mutation in the app (create/update/delete/status-change) is a "lưu" —
        // report success/failure globally here instead of wiring a toast into every call site.
        mutationCache: new MutationCache({
          onSuccess: () => pushToast("success", "Thành công"),
          onError: (error) => pushToast("error", error instanceof ApiError ? error.message : "Có lỗi xảy ra, vui lòng thử lại"),
        }),
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
