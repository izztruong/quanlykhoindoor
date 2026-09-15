"use client";

import { ExpenseProposalFormClient } from "@/components/expenseProposals/ExpenseProposalFormClient";
import { Card, CardBody } from "@/components/ui/Card";
import { useExpenseProposal } from "@/hooks/useExpenseProposals";
import Link from "next/link";
import { use } from "react";

export default function EditExpenseProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: proposal, isLoading } = useExpenseProposal(id);

  if (isLoading) return <p className="text-slate-400">Đang tải...</p>;

  if (!proposal) {
    return (
      <Card>
        <CardBody className="text-sm text-slate-500">Không tìm thấy phiếu đề xuất chi.</CardBody>
      </Card>
    );
  }

  // Server cũng chặn; báo sớm ở đây để không ai gõ lại cả phiếu rồi mới biết không lưu được.
  if (proposal.status !== "PENDING") {
    return (
      <Card>
        <CardBody className="flex flex-col gap-2 text-sm text-slate-500">
          <span>Phiếu {proposal.code} đã được xử lý nên không sửa được nữa.</span>
          <Link href={`/expense-proposals/${proposal.id}`} className="text-indigo-600 hover:underline">
            ← Về chi tiết phiếu
          </Link>
        </CardBody>
      </Card>
    );
  }

  return <ExpenseProposalFormClient existing={proposal} />;
}
