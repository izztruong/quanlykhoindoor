import { PrintOrderClient } from "@/components/orders/PrintOrderClient";

export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PrintOrderClient id={id} />;
}
