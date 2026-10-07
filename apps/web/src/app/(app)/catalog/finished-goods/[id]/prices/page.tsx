import { FinishedGoodPriceClient } from "@/components/catalog/FinishedGoodPriceClient";

export default async function FinishedGoodPricePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinishedGoodPriceClient id={id} />;
}
