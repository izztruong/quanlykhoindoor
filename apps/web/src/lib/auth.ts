import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api-client";
import type { AuthUser } from "@/types";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<{ user: AuthUser }>("/auth/me").then((r) => r.user),
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<{ user: AuthUser }>("/auth/login", data).then((r) => r.user),
    onSuccess: (user) => {
      queryClient.setQueryData(["auth", "me"], user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      queryClient.clear();
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) => api.patch<void>("/auth/password", data),
  });
}
