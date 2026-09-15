import { ExpenseProposalDetailClient } from "@/components/expenseProposals/ExpenseProposalDetailClient";

export default async function ExpenseProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExpenseProposalDetailClient id={id} />;
}
