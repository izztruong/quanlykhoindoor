import { FinishedGoodRecipeClient } from "@/components/catalog/FinishedGoodRecipeClient";

export default async function FinishedGoodRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinishedGoodRecipeClient id={id} />;
}
