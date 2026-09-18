import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import {
  computeExpenseTotals,
  EXPENSE_PAYER_LABEL,
  EXPENSE_PROPOSAL_CATEGORY_LABEL,
  todayForDateInput,
} from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpensePayer, ExpenseProposal, ExpenseProposalCategory } from "@/types";

interface ItemRow {
  key: number;
  content: string;
  unitPrice: string;
  unit: string;
  quantity: string;
  note: string;
}

let rowKey = 0;
const newKey = () => ++rowKey;
const blankRow = (): ItemRow => ({ key: newKey(), content: "", unitPrice: "", unit: "", quantity: "", note: "" });
const isBlankRow = (row: ItemRow) =>
  !row.content.trim() && !row.unitPrice.trim() && !row.unit.trim() && !row.quantity.trim() && !row.note.trim();
const toNumber = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? 0 : Number(value));

const CATEGORY_OPTIONS = Object.entries(EXPENSE_PROPOSAL_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
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
  const [category, setCategory] = useState<ExpenseProposalCategory | "">(existing?.category ?? "");
  const [payer, setPayer] = useState<ExpensePayer>(existing?.payer ?? "CREATOR");

  const { data: shops = [] } = useUserOptions({ scope: "shop" });
  // null = chưa đụng tới ô chọn: phiếu mới chọn sẵn chính người lập nếu họ là quán. Tính lúc render vì
  // danh sách quán và tài khoản đăng nhập tải về sau khi state đã khởi tạo.
  const [pickedShopId, setPickedShopId] = useState<string | null>(existing ? (existing.shopId ?? "") : null);
  const wantedShopId = pickedShopId ?? currentUser?.id ?? "";
  // Quán không còn trong danh sách (vd vai trò đã bỏ cờ "là quán") thì coi như chưa chọn.
  const shopId = shops.some((s) => s.id === wantedShopId) ? wantedShopId : "";

  // Người xác nhận: ngược với quán — chỉ tài khoản KHÔNG phải quán. Người này sẽ nhận thông báo.
  const { data: approvers = [] } = useUserOptions({ scope: "other" });
  const [pickedApproverId, setPickedApproverId] = useState(existing?.approverId ?? "");
  const approverId = approvers.some((a) => a.id === pickedApproverId) ? pickedApproverId : "";

  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [rows, setRows] = useState<ItemRow[]>(() =>
    existing?.items?.length
      ? existing.items.map((it) => ({
          key: newKey(),
          content: it.content,
          unitPrice: String(Number(it.unitPrice)),
          unit: it.unit ?? "",
          quantity: String(Number(it.quantity)),
          note: it.note ?? "",
        }))
      : [blankRow()],
  );
  const [advancePercent, setAdvancePercent] = useState(
    existing?.advancePercent != null ? String(Number(existing.advancePercent)) : "",
  );
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    existing?.invoiceDueDate ? toDateInput(existing.invoiceDueDate) : todayForDateInput(),
  );
  const [error, setError] = useState<string | null>(null);

  const isCreator = payer === "CREATOR";
  const percent = advancePercent.trim() === "" ? null : Number(advancePercent);
  const { amounts, total, advanceAmount } = computeExpenseTotals(
    rows.map((row) => ({ unitPrice: toNumber(row.unitPrice), quantity: toNumber(row.quantity) })),
    isCreator && percent !== null && !Number.isNaN(percent) ? percent : null,
  );

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev));
  }

  function submit() {
    setError(null);
    if (!category) return setError("Vui lòng chọn loại phiếu.");
    if (!shopId) return setError("Vui lòng chọn quán chi.");
    if (!approverId) return setError("Vui lòng chọn người xác nhận.");
    if (!purpose.trim()) return setError("Vui lòng nhập mục đích sử dụng.");

    // Số dòng báo lỗi đếm theo thứ tự trên màn hình, kể cả dòng trống bị bỏ qua.
    const filled = rows.map((row, index) => ({ row, stt: index + 1 })).filter(({ row }) => !isBlankRow(row));
    if (filled.length === 0) return setError("Vui lòng nhập ít nhất 1 hạng mục.");
    for (const { row, stt } of filled) {
      if (!row.content.trim()) return setError(`Dòng ${stt}: chưa nhập nội dung.`);
      if (row.unitPrice.trim() === "" || Number(row.unitPrice) < 0) return setError(`Dòng ${stt}: đơn giá không hợp lệ.`);
      if (!(Number(row.quantity) > 0)) return setError(`Dòng ${stt}: số lượng phải lớn hơn 0.`);
    }
    if (isCreator) {
      if (percent === null || !(percent > 0 && percent <= 100)) {
        return setError("Tạm ứng (%) phải lớn hơn 0 và không quá 100.");
      }
      if (!invoiceDueDate) return setError("Vui lòng chọn ngày trả hoá đơn.");
    }

    const payload = {
      proposalDate,
      payer,
      category,
      shopId,
      approverId,
      purpose: purpose.trim(),
      items: filled.map(({ row }) => ({
        content: row.content.trim(),
        unitPrice: Number(row.unitPrice),
        unit: row.unit.trim() || undefined,
        quantity: Number(row.quantity),
        note: row.note.trim() || undefined,
      })),
      // Kế toán chi thì KHÔNG gửi hai trường tạm ứng — server cũng bỏ qua.
      advancePercent: isCreator ? (percent ?? undefined) : undefined,
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
            label="Loại phiếu"
            required
            value={category}
            onChange={(value) => setCategory(value as ExpenseProposalCategory)}
            options={CATEGORY_OPTIONS}
            placeholder="Chọn loại phiếu"
            searchable={false}
          />
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
            label="Người xác nhận"
            required
            value={approverId}
            onChange={setPickedApproverId}
            options={approvers.map((a) => ({ value: a.id, label: a.name, sublabel: a.email }))}
            placeholder="Chọn người xác nhận"
          />
          <Input label="Mục đích sử dụng" required value={purpose} onChangeText={setPurpose} multiline />
        </CardBody>
      </Card>

      <Text style={styles.sectionLabel}>Hạng mục chi</Text>
      {rows.map((row, index) => (
        <Card key={row.key}>
          <CardBody style={styles.rowCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle}>Dòng {index + 1}</Text>
              {rows.length > 1 ? (
                <Pressable onPress={() => removeRow(row.key)} hitSlop={8} accessibilityLabel={`Xoá dòng ${index + 1}`}>
                  <Ionicons name="close-circle" size={22} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
            <Input label="Nội dung" value={row.content} onChangeText={(content) => updateRow(row.key, { content })} />
            <View style={styles.pair}>
              <Input
                containerStyle={styles.half}
                label="Đơn giá"
                value={row.unitPrice}
                onChangeText={(unitPrice) => updateRow(row.key, { unitPrice })}
                keyboardType="numeric"
              />
              <Input
                containerStyle={styles.half}
                label="Số lượng"
                value={row.quantity}
                onChangeText={(quantity) => updateRow(row.key, { quantity })}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.pair}>
              <Input
                containerStyle={styles.half}
                label="Đơn vị"
                value={row.unit}
                onChangeText={(unit) => updateRow(row.key, { unit })}
              />
              <View style={styles.half}>
                <Text style={styles.amountLabel}>Thành tiền</Text>
                <Text style={styles.amountValue}>{formatCurrency(amounts[index] ?? 0)}</Text>
              </View>
            </View>
            <Input label="Ghi chú" value={row.note} onChangeText={(note) => updateRow(row.key, { note })} />
          </CardBody>
        </Card>
      ))}
      <Button
        title="Thêm dòng"
        variant="secondary"
        fullWidth
        icon={<Ionicons name="add" size={18} color={colors.text} />}
        onPress={() => setRows((prev) => [...prev, blankRow()])}
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Tổng tiền</Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>

      {isCreator ? (
        <Card>
          <CardHeader>
            <CardTitle>Tạm ứng</CardTitle>
          </CardHeader>
          <CardBody style={styles.fields}>
            <View style={styles.pair}>
              <Input
                containerStyle={styles.half}
                label="Tạm ứng (%)"
                required
                value={advancePercent}
                onChangeText={setAdvancePercent}
                keyboardType="numeric"
              />
              <View style={styles.half}>
                <Text style={styles.amountLabel}>Số tiền tạm ứng</Text>
                <Text style={styles.amountValue}>{advanceAmount !== null ? formatCurrency(advanceAmount) : "—"}</Text>
              </View>
            </View>
            <DateTimeField
              label="Ngày trả hoá đơn"
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
  rowCard: { gap: spacing.md, paddingTop: spacing.lg },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  amountLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  amountValue: {
    height: 46,
    lineHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.text,
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
