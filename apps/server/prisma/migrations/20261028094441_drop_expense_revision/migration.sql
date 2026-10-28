-- Bỏ bước "duyệt bổ sung hạng mục chi dự kiến": Hoàn thành giờ được chi vượt tổng dự kiến.
-- Phiếu đang chờ duyệt bổ sung (REAPPROVAL) quay về trạng thái trước đó và bỏ bảng chờ — không còn
-- nút nào để duyệt nó nữa. Cột và giá trị enum giữ lại làm lịch sử (xem schema.prisma).
UPDATE "ExpenseProposal" p
SET "status" = CASE
      WHEN EXISTS (SELECT 1 FROM "ExpenseProposalAdvance" a WHERE a."expenseProposalId" = p."id")
        THEN 'ADVANCED'::"ExpenseProposalStatus"
      ELSE 'APPROVED'::"ExpenseProposalStatus"
    END,
    "pendingItems" = NULL,
    "pendingTotal" = NULL
WHERE p."status" = 'REAPPROVAL';
