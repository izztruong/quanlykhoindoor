import { useState } from "react";
import { Text, View } from "react-native";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { InfoRow } from "@/components/ui/InfoRow";
import { formatCurrency, formatDateVN, formatNumber, labels } from "@/lib/format";
import { colors, spacing } from "@/lib/theme";
import type { InventoryCountRow, ReportDetailRow, ReportSummaryRow } from "@/types";

function ProductHeading({ row }: { row: ReportSummaryRow | ReportDetailRow | InventoryCountRow }) {
  return <View style={{ gap: spacing.xs }}>
    <CardTitle>{row.stt}. {row.product.name}</CardTitle>
    <Text style={{ color: colors.textMuted }}>{row.product.code} · {row.unit.name}</Text>
  </View>;
}

export function SummaryCard({ row }: { row: ReportSummaryRow }) {
  return <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
    <ProductHeading row={row} />
    <InfoRow label="Nhóm" value={row.productGroup.name} />
    <InfoRow label="Kho" value={row.warehouse.name} />
    <InfoRow label="Số lượng" value={formatNumber(row.quantity)} />
    <InfoRow label="Giá vốn" value={formatCurrency(row.costPrice)} />
    <InfoRow label="Tiền vốn" value={formatCurrency(row.costAmount)} />
  </CardBody></Card>;
}

export function DetailCard({ row, variant }: { row: ReportDetailRow; variant: "import" | "export" }) {
  const [expanded, setExpanded] = useState(false);
  const h = row.header;
  return <Card>
    <CardHeader><Text style={{ flex: 1, color: colors.text, fontWeight: "700" }}>{h.code}</Text>
      <Badge tone={h.status === "COMPLETED" ? "green" : h.status === "CANCELLED" ? "red" : "gray"}>{labels.transactionStatus(h.status)}</Badge>
    </CardHeader>
    <CardBody style={{ gap: spacing.sm }}>
      <ProductHeading row={row} />
      <InfoRow label="Loại" value={(variant === "import" ? labels.stockImportType : labels.stockExportType)(h.type)} />
      <InfoRow label="Thời gian" value={formatDateVN(h.transactionAt)} />
      <InfoRow label="Kho" value={h.warehouse.name} />
      <InfoRow label="Số lượng" value={formatNumber(row.quantity)} />
      <InfoRow label="Tiền vốn" value={formatCurrency(row.costAmount)} />
      {expanded && <>
        <InfoRow label="Hình thức" value={labels.transactionForm(h.form)} />
        <InfoRow label="Nhà cung cấp" value={h.supplier?.name ?? "—"} />
        <InfoRow label="Khách hàng" value={h.customer?.name ?? "—"} />
        <InfoRow label="Giá vốn" value={formatCurrency(row.costPrice)} />
        <InfoRow label="Nhóm" value={row.productGroup.name} />
        <InfoRow label="Ghi chú phiếu" value={h.note || "—"} />
        <InfoRow label="Ghi chú hàng hoá" value={row.note || "—"} />
      </>}
      <Button size="sm" variant="ghost" title={expanded ? "Thu gọn" : "Xem thêm"} onPress={() => setExpanded(!expanded)} />
    </CardBody>
  </Card>;
}

export function InventoryCountCard({ row }: { row: InventoryCountRow }) {
  const cells = [
    { label: "Tồn đầu kỳ", value: row.openingQty }, { label: "Nhập trong kỳ", value: row.importedQty },
    { label: "Xuất trong kỳ", value: row.exportedQty }, { label: "Tồn hệ thống", value: row.systemQty },
    { label: "Tồn thực", value: row.actualQty }, { label: "Thừa", value: row.surplusQty, color: colors.success },
    { label: "Thiếu", value: row.shortageQty, color: colors.danger },
  ];
  return <Card><CardBody style={{ paddingTop: spacing.lg, gap: spacing.sm }}>
    <ProductHeading row={row} />
    <InfoRow label="Nhóm" value={row.productGroup.name} />
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{cells.map((cell) => <View key={cell.label} style={{ width: "50%", paddingVertical: spacing.sm }}>
      <Text style={{ color: colors.textMuted }}>{cell.label}</Text>
      <Text style={{ color: cell.color ?? colors.text, fontWeight: "700", fontSize: 18 }}>{formatNumber(cell.value)}</Text>
    </View>)}</View>
  </CardBody></Card>;
}
