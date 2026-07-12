import { StockCheckDetailClient } from "@/components/stockChecks/StockCheckDetailClient";

export default async function StockCheckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockCheckDetailClient id={id} />;
}
