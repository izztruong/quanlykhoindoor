import { RequireAdmin } from "@/components/auth/RequireAdmin";

export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}
