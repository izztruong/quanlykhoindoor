import { BakeryCostCheckDetailClient } from "@/components/bakeryCostChecks/BakeryCostCheckDetailClient";

export default async function BakeryCostCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BakeryCostCheckDetailClient id={id} />;
}
