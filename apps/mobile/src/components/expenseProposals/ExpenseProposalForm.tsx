import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Select } from "@/components/ui/Select";
import { useCreateExpenseProposal, useUpdateExpenseProposal } from "@/hooks/useExpenseProposals";
import { useUserOptions } from "@/hooks/useUsers";
import { useCurrentUser } from "@/lib/auth";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/dateOnly";
import { EXPENSE_PAYER_LABEL, todayForDateInput } from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpensePayer, ExpenseProposal } from "@/types";
import { ExpenseItemsEditor, rowsFromItems, totalsOf, validateRows, type ItemRow } from "./ExpenseItemsEditor";

const PAYER_OPTIONS = Object.entries(EXPENSE_PAYER_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Tạo và sửa phiếu đề xuất chi — cùng luật với ExpenseProposalFormClient bên web. Tiền chỉ tính trước
 * cho người lập nhìn; số lưu thật do server tính lại.
 */
export function ExpenseProposalForm({ existing }: { existing?: ExpenseProposal }) {
  const isEdit = Boolean(existing);
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const createProposal = useCreateExpenseProposal();
  const updateProposal = useUpdateExpenseProposal(existing?.id ?? "");

  // Cột DATE: đọc theo UTC bằng toDateInput, đưa vào ô chọn theo giờ máy.
  const [proposalDate, setProposalDate] = useState(() =>
    existing ? toDateInput(existing.proposalDate) : todayForDateInput(),
  );
  const [payer, setPayer] = useState<ExpensePayer>(existing?.payer ?? "CREATOR");

  const { data: shops = [] } = useUserOptions({ scope: "shop" });
  // null = chưa đụng tới ô chọn: phiếu mới chọn sẵn chính người lập nếu họ là quán. Tính lúc render vì
  // danh sách quán và tài khoản đăng nhập tải về sau khi state đã khởi tạo.
  const [pickedShopId, setPickedShopId] = useState<string | null>(existing ? (existing.shopId ?? "") : null);
  const wantedShopId = pickedShopId ?? currentUser?.id ?? "";
  // Quán không còn trong danh sách (vd vai trò đã bỏ cờ "là quán") thì coi như chưa chọn.
  const shopId = shops.some((s) => s.id === wantedShopId) ? wantedShopId : "";

  // Người duyệt: ngược với quán — chỉ tài khoản KHÔNG phải quán. Chỉ người này (hoặc admin) duyệt được phiếu.
  const { data: approvers = [] } = useUserOptions({ scope: "other" });
  const [pickedApproverId, setPickedApproverId] = useState(existing?.approverId ?? "");
  const approverId = approvers.some((a) => a.id === pickedApproverId) ? pickedApproverId : "";

  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromItems(existing?.items));
  const [advanceAmount, setAdvanceAmount] = useState(
    existing?.advanceAmount != null ? String(Number(existing.advanceAmount)) : "",
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    existing?.invoiceDueDate ? toDateInput(existing.invoiceDueDate) : todayForDateInput(),
  );
  const [error, setError] = useState<string | null>(null);

  const isCreator = payer === "CREATOR";
  const { total } = totalsOf(rows);
  const advance = advanceAmount.trim() === "" ? null : Number(advanceAmount);

  function submit() {
    setError(null);
    if (!shopId) return setError("Vui lòng chọn quán chi.");
    if (!approverId) return setError("Vui lòng chọn người duyệt.");
    if (!purpose.trim()) return setError("Vui lòng nhập mục đích sử dụng.");

    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);
    if (isCreator) {
      if (advance === null || Number.isNaN(advance) || !(advance > 0)) {
        return setError("Số tiền đề nghị tạm ứng phải lớn hơn 0.");
      }
      if (advance > total) return setError("Số tiền đề nghị tạm ứng không được vượt tổng dự kiến.");
      if (!invoiceDueDate) return setError("Vui lòng chọn ngày trả hoá đơn dự kiến.");
    }

    const payload = {
      proposalDate,
      payer,
      shopId,
      approverId,
      purpose: purpose.trim(),
      items: checked.items,
      // Kế toán chi thì KHÔNG gửi hai trường tạm ứng — server cũng bỏ qua.
      advanceAmount: isCreator ? (advance ?? undefined) : undefined,
      invoiceDueDate: isCreator ? invoiceDueDate : undefined,
    };

    if (isEdit && existing) {
      updateProposal.mutate(payload, { onSuccess: () => router.replace(`/expense-proposals/${existing.id}`) });
    } else {
      createProposal.mutate(payload, { onSuccess: (created) => router.replace(`/expense-proposals/${created.id}`) });
    }
  }

  const saving = createProposal.isPending || updateProposal.isPending;
  const creatorName = isEdit ? (existing?.createdBy?.name ?? "—") : (currentUser?.name ?? "");

  return (
    <Screen>
      <Card>
        <CardHeader>
          <CardTitle>Thông tin chung</CardTitle>
        </CardHeader>
        <CardBody style={styles.fields}>
          <DateTimeField
            label="Ngày tạo phiếu"
            required
            dateOnly
            value={dateOnlyToDate(proposalDate)}
            onChange={(date) => setProposalDate(dateToDateOnly(date))}
          />
          <Input label="Người lập phiếu" value={creatorName} editable={false} />
          <Select
            label="Người chi"
            required
            value={payer}
            onChange={(value) => setPayer(value as ExpensePayer)}
            options={PAYER_OPTIONS}
            searchable={false}
          />
          <Select
            label="Quán chi"
            required
            value={shopId}
            onChange={setPickedShopId}
            options={shops.map((s) => ({ value: s.id, label: s.name, sublabel: s.email }))}
            placeholder="Chọn quán chi"
          />
          <Select
            label="Người duyệt"
            required
            value={approverId}
            onChange={setPickedApproverId}
            options={approvers.map((a) => ({ value: a.id, label: a.name, sublabel: a.email }))}
            placeholder="Chọn người duyệt"
          />
          <Input label="Mục đích sử dụng" required value={purpose} onChangeText={setPurpose} multiline />
        </CardBody>
      </Card>

      <Text style={styles.sectionLabel}>Hạng mục chi dự kiến</Text>
      <ExpenseItemsEditor rows={rows} onChange={setRows} />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Tổng dự kiến</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>

      {isCreator ? (
        <Card>
          <CardHeader>
            <CardTitle>Tạm ứng</CardTitle>
          </CardHeader>
          <CardBody style={styles.fields}>
            <Input
              label="Số tiền đề nghị tạm ứng"
              required
              value={advanceAmount}
              onChangeText={setAdvanceAmount}
              keyboardType="numeric"
              hint="Không vượt tổng dự kiến. Kế toán có thể sửa khi tạm ứng."
            />
            <DateTimeField
              label="Ngày trả hoá đơn dự kiến"
              required
              dateOnly
              value={dateOnlyToDate(invoiceDueDate)}
              onChange={(date) => setInvoiceDueDate(dateToDateOnly(date))}
            />
          </CardBody>
        </Card>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title={isEdit ? "Lưu thay đổi" : "Tạo phiếu"} fullWidth loading={saving} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.lg, paddingTop: spacing.xs },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: spacing.xs,
  },
  totalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  totalLabel: { fontSize: fontSize.md, color: colors.info, fontWeight: "600" },
  totalValue: { fontSize: fontSize.xl, color: colors.info, fontWeight: "700" },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: "center" },
});
