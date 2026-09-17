import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { TAB_BAR_CLEARANCE } from "./Screen";
import { colors, fontSize, spacing } from "@/lib/theme";

interface DataListProps<T> {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
  isLoading?: boolean;
  isRefetching?: boolean;
  onRefresh?: () => void;
  /** Gọi khi cuộn tới cuối và còn trang sau — tải thêm 20 dòng nữa. */
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  emptyMessage?: string;
  header?: React.ReactElement;
  withTabBar?: boolean;
}

/**
 * Danh sách dạng thẻ thay cho bảng của bản web: bảng ở đó rộng tối thiểu 900px, cuộn ngang trên
 * điện thoại thì không đọc được. Mỗi bản ghi là một thẻ, các cột phụ xuống thành dòng nhãn–giá trị.
 */
export function DataList<T>({
  data,
  keyExtractor,
  renderItem,
  isLoading,
  isRefetching,
  onRefresh,
  onEndReached,
  isFetchingMore,
  emptyMessage = "Không có dữ liệu",
  header,
  withTabBar,
}: DataListProps<T>) {
  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => renderItem(item)}
      ListHeaderComponent={header}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: withTabBar ? TAB_BAR_CLEARANCE : spacing.xxl },
        data.length === 0 && styles.contentEmpty,
      ]}
      keyboardShouldPersistTaps="handled"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!isRefetching} onRefresh={onRefresh} tintColor={colors.primary} />
        ) : undefined
      }
      ListEmptyComponent={
        isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Đang tải dữ liệu...</Text>
          </View>
        ) : (
          <View style={styles.state}>
            <Text style={styles.stateText}>{emptyMessage}</Text>
          </View>
        )
      }
      ListFooterComponent={
        isFetchingMore ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  contentEmpty: { flexGrow: 1 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl },
  stateText: { fontSize: fontSize.sm, color: colors.textMuted },
  footer: { marginVertical: spacing.lg },
});
