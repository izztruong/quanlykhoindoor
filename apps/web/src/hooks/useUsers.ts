import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuthUser } from "@/types";

export interface ManagedUser extends AuthUser {
  createdAt: string;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "STAFF";
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ items: ManagedUser[] }>("/users").then((r) => r.items),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserInput) => api.post<ManagedUser>("/users", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
