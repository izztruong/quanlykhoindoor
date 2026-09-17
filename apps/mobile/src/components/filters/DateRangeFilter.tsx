import { StyleSheet, Text, View } from "react-native";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { dateOnlyToDate as toDate, dateToDateOnly as toValue } from "@/lib/dateOnly";
import { clampDateRange } from "@/lib/dateRange";
import { colors, fontSize, spacing } from "@/lib/theme";

export interface DateRange {
  /** Dạng "YYYY-MM-DD" — đúng thứ server nhận ở ?from=&to=. */
  from: string;
  to: string;
}

/** Khoảng ngày tối đa 3 tháng — dùng chung clampDateRange với bản web nên hai bên chặn giống nhau. */
export function DateRangeFilter({
  value,
  onChange,
  label = "Khoảng ngày",
}: {
  value: DateRange;
  onChange: (next: DateRange) => void;
  label?: string;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label} (tối đa 3 tháng)</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <DateTimeField
            dateOnly
            value={toDate(value.from)}
            onChange={(date) => onChange(clampDateRange(toValue(date), value.to, "from"))}
          />
        </View>
        <View style={styles.half}>
          <DateTimeField
            dateOnly
            value={toDate(value.to)}
            onChange={(date) => onChange(clampDateRange(value.from, toValue(date), "to"))}
          />
        </View>
      </View>
    </View>
  );
}

/** Mặc định: từ đầu tháng này tới hôm nay — cùng mặc định với các trang báo cáo bên web. */
export function currentMonthRange(): DateRange {
  const now = new Date();
  return { from: toValue(new Date(now.getFullYear(), now.getMonth(), 1)), to: toValue(now) };
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
});

/** Nhãn ngắn cho dòng tóm tắt bộ lọc: "01/09 – 16/09". Bỏ năm cho gọn, năm đã có trong ô chọn. */
export function formatRangeLabel(range: DateRange): string {
  const short = (value: string) => {
    const [, month, day] = value.split("-");
    return `${day}/${month}`;
  };
  return `${short(range.from)} – ${short(range.to)}`;
}
