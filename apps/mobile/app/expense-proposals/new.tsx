import { Stack } from "expo-router";
import { ExpenseProposalForm } from "@/components/expenseProposals/ExpenseProposalForm";

export default function NewExpenseProposalScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Tạo phiếu đề xuất chi" }} />
      <ExpenseProposalForm />
    </>
  );
}
