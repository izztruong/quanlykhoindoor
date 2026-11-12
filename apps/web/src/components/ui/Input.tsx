import { cn } from "@/lib/cn";
import { forwardRef, InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, onWheel, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      onWheel={(event) => {
        // Lăn chuột trên ô số ĐANG focus thì trình duyệt tăng/giảm giá trị thay vì cuộn trang —
        // rất dễ sửa nhầm số liệu khi cuộn qua bảng kiểm kê dài mà không hề hay biết. Bỏ focus
        // ngay trong lúc xử lý sự kiện: trình duyệt chưa kịp áp dụng thay đổi, nên giá trị giữ
        // nguyên và trang cuộn bình thường.
        //
        // Không dùng preventDefault: React gắn listener `wheel` ở chế độ passive nên gọi cũng vô
        // hiệu, mà nếu chặn được thì lại chặn luôn cả việc cuộn trang.
        if (event.currentTarget.type === "number") event.currentTarget.blur();
        onWheel?.(event);
      }}
      className={cn(
        "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-xs transition-colors placeholder:text-slate-400",
        "hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 read-only:bg-slate-50",
        className,
      )}
      {...props}
    />
  );
});
