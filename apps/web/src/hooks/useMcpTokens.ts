import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CreatedMcpToken, McpToken, McpToolCatalog } from "@/types";

export interface McpTokenInput {
  name: string;
  tools: string[];
}

/** Danh mục tool do server khai — thêm tool ở server là ô tick tự hiện, web không chép lại. */
export function useMcpToolCatalog() {
  return useQuery({
    queryKey: ["mcp-tokens", "catalog"],
    queryFn: () => api.get<McpToolCatalog>("/mcp-tokens/catalog"),
    staleTime: Infinity,
  });
}

export function useMcpTokens() {
  return useQuery({
    queryKey: ["mcp-tokens", "list"],
    queryFn: () => api.get<{ items: McpToken[] }>("/mcp-tokens").then((r) => r.items),
  });
}

function useInvalidateMcpTokens() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["mcp-tokens", "list"] });
}

export function useCreateMcpToken() {
  const invalidate = useInvalidateMcpTokens();
  return useMutation({
    mutationFn: (data: McpTokenInput) => api.post<CreatedMcpToken>("/mcp-tokens", data),
    onSuccess: invalidate,
  });
}

export function useUpdateMcpToken() {
  const invalidate = useInvalidateMcpTokens();
  return useMutation({
    mutationFn: ({ id, ...data }: McpTokenInput & { id: string }) => api.put<McpToken>(`/mcp-tokens/${id}`, data),
    onSuccess: invalidate,
  });
}

export function useDeleteMcpToken() {
  const invalidate = useInvalidateMcpTokens();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/mcp-tokens/${id}`),
    onSuccess: invalidate,
  });
}
