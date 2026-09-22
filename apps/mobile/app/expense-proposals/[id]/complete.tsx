import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  ExpenseItemsEditor,
  blankRow,
  isBlankRow,
  rowsFromItems,
  totalsOf,
  validateRows,
  type ItemRow,
} from "@/components/expenseProposals/ExpenseItemsEditor";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { ErrorState, LoadingState, Screen } from "@/components/ui/Screen";
import {
  useCompleteExpenseProposal,
  useExpenseProposal,
  useUploadExpenseProposalImages,
} from "@/hooks/useExpenseProposals";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/dateOnly";
import { MAX_PROPOSAL_IMAGES, todayForDateInput } from "@/lib/expenseProposal";
import { formatCurrency, toDateInput } from "@/lib/format";
import { captureReceiptPhoto, pickReceiptPhotos, type CompressedImage } from "@/lib/imagePicker";
import { colors, fontSize, radius, spacing } from "@/lib/theme";
import type { ExpenseProposal } from "@/types";

export default function ExpenseProposalCompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const proposal = useExpenseProposal(id ?? "");
  const data = proposal.data;
  // Cùng điều kiện với server: Đã duyệt mà không có tạm ứng (kế toán chi), hoặc Đã tạm ứng.
  const completable = data && ((data.status === "APPROVED" && data.advanceAmount == null) || data.status === "ADVANCED");

  return (
    <>
      <Stack.Screen options={{ title: "Hoàn thành phiếu" }} />
      {proposal.isLoading ? (
        <LoadingState />
      ) : !data ? (
        <ErrorState message="Không tìm thấy phiếu đề xuất chi." />
      ) : !completable ? (
        <ErrorState message={`Phiếu ${data.code} không ở trạng thái cho phép hoàn thành.`} />
      ) : (
        <CompleteForm proposal={data} />
      )}
    </>
  );
}

/**
 * Khai hạng mục thực chi (sao chép từ dự kiến rồi sửa được), ngày nộp hoá đơn và ảnh chứng từ không bắt
 * buộc. Thực chi vượt tổng dự kiến đã duyệt thì khoá nút — phải duyệt bổ sung trước. Cùng luật với web.
 */
function CompleteForm({ proposal }: { proposal: ExpenseProposal }) {
  const router = useRouter();
  const complete = useCompleteExpenseProposal(proposal.id);
  const uploadImages = useUploadExpenseProposalImages(proposal.id);
  const [rows, setRows] = useState<ItemRow[]>(() => [blankRow()]);
  const [invoiceDate, setInvoiceDate] = useState(() =>
    proposal.invoiceDueDate ? toDateInput(proposal.invoiceDueDate) : todayForDateInput(),
  );
  const [photos, setPhotos] = useState<CompressedImage[]>([]);
  /** Thời gian nén ảnh trên máy — cũng phải khoá nút chọn ảnh. */
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { total } = totalsOf(rows);
  const budget = Number(proposal.totalAmount);
  const overBudget = total > budget;
  const remainingPhotos = MAX_PROPOSAL_IMAGES - photos.length;
  const busy = complete.isPending || uploading;

  function copyEstimated() {
    const apply = () => setRows(rowsFromItems(proposal.items));
    if (rows.every(isBlankRow)) return apply();
    Alert.alert("Sao chép hạng mục", "Thay bảng thực chi đang nhập bằng hạng mục chi dự kiến?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Thay", onPress: apply },
    ]);
  }

  async function addPhotos(source: "camera" | "library") {
    if (remainingPhotos <= 0) {
      Alert.alert("Đủ ảnh rồi", `Mỗi phiếu tối đa ${MAX_PROPOSAL_IMAGES} ảnh chứng từ.`);
      return;
    }
    setPreparing(true);
    try {
      const picked = source === "camera" ? await captureReceiptPhoto() : await pickReceiptPhotos(remainingPhotos);
      setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PROPOSAL_IMAGES));
    } catch (err) {
      Alert.alert("Không lấy được ảnh", err instanceof Error ? err.message : "Vui lòng thử lại");
    } finally {
      setPreparing(false);
    }
  }

  async function submit() {
    setError(null);
    const checked = validateRows(rows);
    if ("error" in checked) return setError(checked.error);
    if (!invoiceDate) return setError("Vui lòng chọn ngày nộp hoá đơn.");
    if (overBudget) return setError("Chi vượt dự kiến — hãy thêm hạng mục chi dự kiến để người duyệt duyệt trước.");

    try {
      await complete.mutateAsync({ items: checked.items, invoiceDate });
    } catch {
      // Toast lỗi đã hiện ở MutationCache; giữ nguyên màn để người dùng sửa và bấm lại.
      return;
    }

    // Phiếu đã hoàn thành rồi — ảnh lỗi vẫn quay về chi tiết và báo rõ, không để người dùng tưởng
    // cả phiếu chưa lưu mà bấm lại.
    if (photos.length > 0) {
      setUploading(true);
      try {
        await uploadImages.mutateAsync(photos.map((p) => ({ contentType: p.contentType, dataBase64: p.dataBase64 })));
      } catch {
        Alert.alert("Chưa đính được ảnh", "Phiếu đã hoàn thành nhưng tải ảnh chứng từ lỗi. Có thể đính lại ở mục Chứng từ.");
      } finally {
        setUploading(false);
      }
    }
    router.back();
  }

  return (
    <Screen>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>Hạng mục chi thực tế</Text>
        <Button
          title="Sao chép dự kiến"
          variant="secondary"
          size="sm"
          disabled={busy}
          icon={<Ionicons name="copy-outline" size={16} color={colors.text} />}
          onPress={copyEstimated}
        />
      </View>
      <ExpenseItemsEditor rows={rows} onChange={setRows} />

      <View style={[styles.totalCard, overBudget && styles.totalCardOver]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, overBudget && styles.overText]}>Tổng tiền đã chi</Text>
          <Text style={[styles.totalValue, overBudget && styles.overText]}>{formatCurrency(total)}</Text>
        </View>
        <Text style={[styles.budget, overBudget && styles.overText]}>Tổng dự kiến đã duyệt: {formatCurrency(budget)}</Text>
        {overBudget ? (
          <Text style={styles.overHint}>
            Vượt dự kiến {formatCurrency(total - budget)} — hãy dùng &quot;Thêm hạng mục chi dự kiến&quot; để duyệt bổ sung trước.
          </Text>
        ) : null}
      </View>

      <Card>
        <CardBody style={styles.fields}>
          <DateTimeField
            label="Ngày nộp hoá đơn"
            required
            dateOnly
            value={dateOnlyToDate(invoiceDate)}
            onChange={(date) => setInvoiceDate(dateToDateOnly(date))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Chứng từ ({photos.length}/{MAX_PROPOSAL_IMAGES})
          </CardTitle>
          <Text style={styles.optional}>Không bắt buộc</Text>
        </CardHeader>
        <CardBody style={styles.fields}>
          {photos.length > 0 || preparing ? (
            <View style={styles.thumbRow}>
              {photos.map((photo) => (
                <View key={photo.uri} style={styles.thumbWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
                  <Pressable
                    style={styles.thumbRemove}
                    hitSlop={6}
                    accessibilityLabel="Bỏ ảnh"
                    onPress={() => setPhotos((prev) => prev.filter((p) => p.uri !== photo.uri))}
                  >
                    <Ionicons name="close" size={14} color={colors.onPrimary} />
                  </Pressable>
                </View>
              ))}
              {preparing ? (
                <View style={[styles.thumb, styles.thumbLoading]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.pair}>
            <Button
              title="Chụp ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || preparing || remainingPhotos <= 0}
              icon={<Ionicons name="camera-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("camera")}
            />
            <Button
              title="Chọn ảnh"
              variant="secondary"
              size="sm"
              style={styles.half}
              disabled={busy || preparing || remainingPhotos <= 0}
              icon={<Ionicons name="images-outline" size={16} color={colors.text} />}
              onPress={() => addPhotos("library")}
            />
          </View>
        </CardBody>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        title={uploading ? "Đang tải ảnh..." : "Hoàn thành"}
        fullWidth
        loading={complete.isPending}
        disabled={busy || preparing || overBudget}
        onPress={submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    paddingHorizontal: spacing.xs,
  },
  fields: { gap: spacing.md, paddingTop: spacing.md },
  totalCard: { gap: 4, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  totalCardOver: { backgroundColor: colors.dangerSoft },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontSize: fontSize.md, color: colors.info, fontWeight: "600" },
  totalValue: { fontSize: fontSize.xl, color: colors.info, fontWeight: "700" },
  budget: { fontSize: fontSize.sm, color: colors.info },
  overText: { color: colors.danger },
  overHint: { fontSize: fontSize.sm, color: colors.danger, fontWeight: "600" },
  optional: { fontSize: fontSize.sm, color: colors.textFaint },
  pair: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  thumbWrap: { width: 80, height: 80 },
  thumb: { width: 80, height: 80, borderRadius: radius.md, backgroundColor: colors.subtle },
  thumbLoading: { alignItems: "center", justifyContent: "center" },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontSize: fontSize.sm, color: colors.danger, textAlign: "center" },
});
