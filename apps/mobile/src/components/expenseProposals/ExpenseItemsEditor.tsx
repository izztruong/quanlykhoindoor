import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { ExpenseProposalItemInput } from "@/hooks/useExpenseProposals";
import { computeExpenseTotals } from "@/lib/expenseProposal";
import { formatCurrency } from "@/lib/format";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpenseProposalItem, ExpenseProposalPendingItem } from "@/types";

/** Một dòng đang nhập — giữ chuỗi thô để ô số không nhảy giá trị khi đang gõ dở. */
export interface ItemRow {
  key: number;
  content: string;
  unitPrice: string;
  unit: string;
  quantity: string;
  note: string;
}

let rowKey = 0;
const newKey = () => ++rowKey;

export const blankRow = (): ItemRow => ({ key: newKey(), content: "", unitPrice: "", unit: "", quantity: "", note: "" });

export const isBlankRow = (row: ItemRow) =>
  !row.content.trim() && !row.unitPrice.trim() && !row.unit.trim() && !row.quantity.trim() && !row.note.trim();

/** Hạng mục đã lưu → dòng để sửa (form sửa phiếu, sao chép từ dự kiến, bảng duyệt bổ sung). */
export function rowsFromItems(items: (ExpenseProposalItem | ExpenseProposalPendingItem)[] | null | undefined): ItemRow[] {
  if (!items?.length) return [blankRow()];
  return items.map((it) => ({
    key: newKey(),
    content: it.content,
    unitPrice: String(Number(it.unitPrice)),
    unit: it.unit ?? "",
    quantity: String(Number(it.quantity)),
    note: it.note ?? "",
  }));
}

const toNumber = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? 0 : Number(value));

export function totalsOf(rows: ItemRow[]) {
  return computeExpenseTotals(rows.map((row) => ({ unitPrice: toNumber(row.unitPrice), quantity: toNumber(row.quantity) })));
}

/** Kiểm và chuyển dòng thành payload API — cùng luật với bản web. Dòng trống hoàn toàn bị bỏ qua. */
export function validateRows(rows: ItemRow[]): { items: ExpenseProposalItemInput[] } | { error: string } {
  // Số dòng báo lỗi đếm theo thứ tự trên màn hình, kể cả dòng trống bị bỏ qua.
  const filled = rows.map((row, index) => ({ row, stt: index + 1 })).filter(({ row }) => !isBlankRow(row));
  if (filled.length === 0) return { error: "Vui lòng nhập ít nhất 1 hạng mục." };
  for (const { row, stt } of filled) {
    if (!row.content.trim()) return { error: `Dòng ${stt}: chưa nhập nội dung.` };
    if (row.unitPrice.trim() === "" || !(Number(row.unitPrice) >= 0)) return { error: `Dòng ${stt}: đơn giá không hợp lệ.` };
    if (!(Number(row.quantity) > 0)) return { error: `Dòng ${stt}: số lượng phải lớn hơn 0.` };
  }
  return {
    items: filled.map(({ row }) => ({
      content: row.content.trim(),
      unitPrice: Number(row.unitPrice),
      unit: row.unit.trim() || undefined,
      quantity: Number(row.quantity),
      note: row.note.trim() || undefined,
    })),
  };
}

interface ExpenseItemsEditorProps {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
}

/** Danh sách hạng mục nhập tay: mỗi dòng một thẻ, thêm/xoá dòng, thành tiền tự tính. */
export function ExpenseItemsEditor({ rows, onChange }: ExpenseItemsEditorProps) {
  const { amounts } = totalsOf(rows);

  function updateRow(key: number, patch: Partial<ItemRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: number) {
    if (rows.length > 1) onChange(rows.filter((row) => row.key !== key));
  }

  return (
    <View style={styles.list}>
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
              <Input containerStyle={styles.half} label="Đơn vị" value={row.unit} onChangeText={(unit) => updateRow(row.key, { unit })} />
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
        onPress={() => onChange([...rows, blankRow()])}
      />
    </View>
  );
}

/** Ô giá trị chỉ đọc cùng chiều cao với Input — dùng cho số tự tính (thành tiền, tổng...). */
export const readonlyValueStyles = StyleSheet.create({
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted, marginBottom: 6 },
  value: {
    height: 46,
    lineHeight: 46,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.subtle,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.text,
  },
});

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  rowCard: { gap: spacing.md, paddingTop: spacing.lg },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.textMuted },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  amountLabel: readonlyValueStyles.label,
  amountValue: readonlyValueStyles.value,
});
