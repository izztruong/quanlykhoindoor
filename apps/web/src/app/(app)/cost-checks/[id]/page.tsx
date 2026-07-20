import { CostCheckDetailClient } from "@/components/costChecks/CostCheckDetailClient";

export default async function CostCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CostCheckDetailClient id={id} />;
}
