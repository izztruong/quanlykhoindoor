import { StockImportEditClient } from "@/components/stock/StockImportEditClient";

export default async function StockImportEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockImportEditClient id={id} />;
}
