import { OrderConfirmClient } from "@/components/orders/OrderConfirmClient";

export default async function OrderConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderConfirmClient id={id} />;
}
