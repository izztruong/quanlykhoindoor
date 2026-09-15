import { DashboardClient } from "@/components/dashboard/DashboardClient";

// Không nằm trong nav-config nên layout không chặn theo quyền: ai đăng nhập cũng mở được, từng ô tự
// ẩn theo quyền của người xem (xem DashboardClient).
export default function HomePage() {
  return <DashboardClient />;
}
