/** Một đám mây: vài hình elip chồng nhau, cùng màu nên nhìn liền một khối. */
function Cloud({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 70" className={className} aria-hidden>
      <g fill="currentColor">
        <ellipse cx="60" cy="48" rx="50" ry="20" />
        <ellipse cx="95" cy="32" rx="38" ry="28" />
        <ellipse cx="135" cy="46" rx="48" ry="22" />
        <ellipse cx="100" cy="56" rx="85" ry="14" />
      </g>
    </svg>
  );
}

/**
 * Nền trời xanh nhạt có mây ở đầu trang chủ, nhạt dần về màu nền chung (slate-50) nên các thẻ trắng
 * phía dưới không bị cắt ngang. Chỉ trang trí: nằm sau nội dung, không nhận chuột.
 */
export function SkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden bg-linear-to-b from-sky-200 via-sky-100 to-slate-50">
      <Cloud className="absolute -left-6 top-6 w-48 text-white/70" />
      <Cloud className="absolute left-[38%] top-20 hidden w-32 text-white/60 sm:block" />
      <Cloud className="absolute right-[18%] top-3 w-40 text-white/60" />
      <Cloud className="absolute -right-10 top-28 hidden w-56 text-white/50 md:block" />
    </div>
  );
}
