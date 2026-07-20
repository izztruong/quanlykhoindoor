import { MaterialWasteDetailClient } from "@/components/materialWaste/MaterialWasteDetailClient";

export default async function MaterialWasteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaterialWasteDetailClient id={id} />;
}
