import { MaterialTransferDetailClient } from "@/components/materialTransfers/MaterialTransferDetailClient";

export default async function MaterialTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialTransferDetailClient id={id} />;
}
