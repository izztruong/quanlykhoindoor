"use client";

import { rememberedListUrl } from "@/hooks/useListUrlState";
import Link from "next/link";
import { useSyncExternalStore, type ComponentProps } from "react";

const subscribe = () => () => {};

/**
 * Link "← Danh sách …" từ trang chi tiết/tạo: về đúng URL danh sách gần nhất (trang + bộ lọc) mà
 * useListUrlState đã nhớ, thay vì luôn về trang 1. Đọc sessionStorage qua useSyncExternalStore với
 * snapshot server = `href`, nên HTML render sẵn và lần hydrate đầu khớp nhau.
 */
export function BackToListLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const target = useSyncExternalStore(
    subscribe,
    () => rememberedListUrl(href),
    () => href,
  );
  return <Link href={target} {...props} />;
}
