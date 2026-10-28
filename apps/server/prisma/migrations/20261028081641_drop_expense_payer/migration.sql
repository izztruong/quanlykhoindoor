-- Bỏ ô "Người chi": mọi phiếu đề xuất chi đi luồng người lập chi (luôn có số tiền đề nghị tạm ứng).
-- Luồng xử lý chưa bao giờ đọc cột này — nó dựa vào "advanceAmount" null hay không — nên phiếu cũ
-- từng chọn "Kế toán" vẫn Hoàn thành thẳng từ Đã duyệt được, chỉ mất nhãn.
ALTER TABLE "ExpenseProposal" DROP COLUMN "payer";

DROP TYPE "ExpensePayer";
