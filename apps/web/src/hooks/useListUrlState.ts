"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Trạng thái của một trang danh sách (số trang, số dòng/trang, bộ lọc ĐÃ áp) giữ trên query string,
 * để mở chi tiết rồi quay lại — bằng nút Trở lại của trình duyệt hay link "← Danh sách" — vẫn đúng
 * trang và bộ lọc cũ. Giữ trong useState thì rời trang là mất, về lại luôn là trang 1.
 *
 * - Key vắng mặt trên URL = giá trị mặc định; key có mặt (kể cả rỗng) = đúng giá trị đó. Nhờ vậy trang
 *   có mặc định khác rỗng (Order bánh lọc trạng thái theo vai trò) vẫn lưu được lựa chọn "Tất cả".
 * - Ghi bằng history.replaceState (Next tự đồng bộ useSearchParams, không gọi lại server). Cố ý
 *   REPLACE chứ không push: đổi bộ lọc mà đẻ thêm mục lịch sử thì Trở lại phải bấm qua từng lần lọc.
 * - Chỉ dùng cho trạng thái danh sách; modal, lỗi, dữ liệu nháp… vẫn để useState.
 *
 * Gọi hook này thì cây component phải nằm trong <Suspense> (đã bọc sẵn ở app/(app)/layout.tsx) —
 * thiếu nó `next build` lỗi "Missing Suspense boundary", còn dev thì không báo gì.
 */
export function useListUrlState<T extends Record<string, string>>(defaults: T) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const values = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const fromUrl = searchParams.get(key as string);
    if (fromUrl !== null) values[key] = fromUrl as T[keyof T];
  }

  // Nhớ URL danh sách gần nhất để link "← Danh sách" và điều hướng sau khi xoá phiếu quay về đúng chỗ
  // (xem rememberedListUrl). Chạy cả lúc mount lẫn mỗi lần query đổi.
  const query = searchParams.toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(pathname), query ? `${pathname}?${query}` : pathname);
    } catch {
      // Trình duyệt chặn storage (chế độ riêng tư…): link quay lại rơi về trang 1 như trước, không sao.
    }
  }, [pathname, query]);

  function update(patch: Partial<T>) {
    const next = { ...values, ...patch };
    const params = new URLSearchParams();
    // Giữ nguyên tham số lạ không do hook quản lý.
    searchParams.forEach((value, key) => {
      if (!(key in defaults)) params.set(key, value);
    });
    for (const key of Object.keys(defaults)) {
      if (next[key] !== defaults[key]) params.set(key, next[key] ?? "");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  return { values, update };
}

function storageKey(pathname: string) {
  return `listUrl:${pathname}`;
}

/** URL danh sách gần nhất của `basePath` (kèm trang + bộ lọc), hoặc chính `basePath` nếu chưa có. */
export function rememberedListUrl(basePath: string): string {
  try {
    const stored = sessionStorage.getItem(storageKey(basePath));
    if (stored && (stored === basePath || stored.startsWith(`${basePath}?`))) return stored;
  } catch {
    // bỏ qua — rơi về basePath
  }
  return basePath;
}

/** Số trang từ URL; giá trị rác (chữ, số âm, số lẻ) về trang 1. */
export function parsePage(value: string): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Số dòng/trang từ URL, chỉ nhận các mức có trong ô chọn — người sửa tay URL không xin được 10.000 dòng. */
export function parsePageSize(value: string, allowed: number[] = [20, 50, 100]): number {
  const n = Number(value);
  return allowed.includes(n) ? n : allowed[0];
}
