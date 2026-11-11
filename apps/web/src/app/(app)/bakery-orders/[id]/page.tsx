import { BakeryOrderDetailClient } from "@/components/bakeryOrders/BakeryOrderDetailClient";

export default async function BakeryOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BakeryOrderDetailClient id={id} />;
}
