import { RequireAdmin } from "@/components/auth/RequireAdmin";

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
