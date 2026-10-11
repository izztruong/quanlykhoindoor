import { StockImportDetailClient } from "@/components/stock/StockImportDetailClient";

export default async function StockImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockImportDetailClient id={id} />;
}
