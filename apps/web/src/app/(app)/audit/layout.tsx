import { RequireAdmin } from "@/components/auth/RequireAdmin";

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
