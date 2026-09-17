/**
 * Token giao diện dùng chung. Đặt ở một chỗ để mọi màn hình không tự chế màu — RN không có
 * Tailwind nên không có sẵn bảng màu như bên web.
 */
export const colors = {
  /** Nền toàn app: xám rất nhạt, để thẻ trắng nổi lên. */
  background: "#F2F4F8",
  surface: "#FFFFFF",
  /** Nền chìm trong thẻ (ô lọc, hàng danh sách bị mờ). */
  subtle: "#F6F8FB",

  primary: "#1F6FEB",
  /** Nền tròn sau icon ở khối "Thao tác nhanh". */
  primarySoft: "#E3EDFD",
  primaryPressed: "#1A5FCC",

  text: "#101828",
  textMuted: "#667085",
  textFaint: "#98A2B3",
  /** Chữ trên nền primary. */
  onPrimary: "#FFFFFF",

  border: "#E4E7EC",
  borderStrong: "#D0D5DD",

  danger: "#D92D20",
  dangerSoft: "#FEE4E2",
  success: "#039855",
  successSoft: "#D1FADF",
  warning: "#DC6803",
  warningSoft: "#FEF0C7",
  info: "#175CD3",
  infoSoft: "#D1E9FF",
  neutralSoft: "#EAECF0",
} as const;

/**
 * Nền đầu trang: đậm ở trên, nhạt dần xuống rồi tan vào nền trang. Điểm cuối phải đúng bằng
 * `colors.background`, nếu không sẽ thấy một vệt cắt ngang ở chỗ dải này kết thúc.
 */
export const headerGradient = ["#F0D7A2", "#FAEEDA", colors.background] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
} as const;

/** Đổ bóng nhẹ cho thẻ — iOS dùng shadow*, Android dùng elevation, phải khai cả hai. */
export const shadow = {
  card: {
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  /** Thanh tab nổi ở đáy màn hình, cần bóng đậm hơn thẻ. */
  floating: {
    shadowColor: "#101828",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
} as const;
