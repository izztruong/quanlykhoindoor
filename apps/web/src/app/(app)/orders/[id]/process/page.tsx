import { OrderProcessClient } from "@/components/orders/OrderProcessClient";

export default async function OrderProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderProcessClient id={id} />;
}
