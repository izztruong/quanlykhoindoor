import { useCallback, useMemo, useState } from "react";

/**
 * Tách "bộ lọc đang áp dụng" khỏi "bộ lọc đang chỉnh trong dialog".
 *
 * `applied` là thứ truyền xuống API; `draft` là thứ người dùng đang sửa. Mở dialog thì chép
 * applied → draft, bấm Áp dụng thì chép ngược lại. Nhờ vậy đóng dialog bằng nút X hoặc chạm nền mờ
 * đồng nghĩa với huỷ thay đổi — đúng thứ người dùng chờ đợi ở một tấm trượt từ dưới lên, và danh
 * sách chỉ gọi API một lần cho mỗi lần lọc thay vì mỗi lần chạm một ô.
 */
export function useFilterSheet<T extends object>(makeInitial: () => T) {
  // Giữ luôn giá trị mặc định để nút "Xoá lọc" và phép đếm ô đang lọc có mốc so sánh.
  const [initial] = useState(makeInitial);
  const [applied, setApplied] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [open, setOpen] = useState(false);

  const patchDraft = useCallback((patch: Partial<T>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const openSheet = useCallback(() => {
    setDraft(applied);
    setOpen(true);
  }, [applied]);

  const close = useCallback(() => setOpen(false), []);

  const apply = useCallback(() => {
    setApplied(draft);
    setOpen(false);
  }, [draft]);

  /** Xoá lọc chỉ đặt lại ô trong dialog — người dùng vẫn phải bấm Áp dụng, không có gì xảy ra sau lưng. */
  const clear = useCallback(() => setDraft(initial), [initial]);

  /** Số ô đang khác mặc định — hiện thành con số nhỏ trên icon phễu. */
  const activeCount = useMemo(() => {
    return Object.keys(initial).reduce((count, key) => {
      const current = applied[key as keyof T];
      const base = initial[key as keyof T];
      // So bằng JSON vì có ô là object (khoảng ngày { from, to }); các ô lọc đều là dữ liệu phẳng.
      return JSON.stringify(current) === JSON.stringify(base) ? count : count + 1;
    }, 0);
  }, [applied, initial]);

  return { applied, draft, open, patchDraft, openSheet, close, apply, clear, activeCount };
}
