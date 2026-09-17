import { useEffect, useState } from "react";

/**
 * Trả lại `value` sau khi nó đứng yên `delay` mili-giây.
 *
 * Ô tìm kiếm nối thẳng vào queryKey của TanStack Query, nên không có thứ này thì gõ "cà phê" là sáu
 * lượt gọi API liên tiếp — tốn quota và trên gói free của Render còn phải chờ server thức dậy.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
