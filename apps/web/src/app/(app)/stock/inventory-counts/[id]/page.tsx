import { InventoryCountDetailClient } from "@/components/inventoryCounts/InventoryCountDetailClient";

export default async function InventoryCountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InventoryCountDetailClient id={id} />;
}
