import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { FilterBar } from "@/components/filters/FilterBar";
import { FilterSheet } from "@/components/filters/FilterSheet";
import { Button } from "@/components/ui/Button";
import { DataList } from "@/components/ui/DataList";
import { Field, Input } from "@/components/ui/Input";
import { ListRowCard, type MetaEntry } from "@/components/ui/ListRowCard";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useFilterSheet } from "@/hooks/useFilterSheet";
import { api, ApiError } from "@/lib/apiClient";
import { useCan } from "@/lib/permissions";
import { colors, fontSize, spacing } from "@/lib/theme";
import type { PagedResult } from "@/types";

export interface CatalogFieldConfig {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea" | "checkbox";
  required?: boolean;
  options?: { value: string; label: string }[];
}

export interface CatalogFilterConfig {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface CatalogRow {
  title: string;
  subtitle?: string;
  meta?: MetaEntry[];
  badge?: React.ReactNode;
}

interface CatalogScreenProps<T extends { id: string }> {
  title: string;
  /** Mã resource phân quyền (vd "UNITS") — ẩn nút Thêm/Sửa/Xoá theo quyền ADD/EDIT/DELETE. */
  resource: string;
  endpoint: string;
  queryKey: string;
  fields: CatalogFieldConfig[];
  renderRow: (item: T) => CatalogRow;
  toFormValues?: (item: T) => Record<string, string>;
  filters?: CatalogFilterConfig[];
  /** Chạm vào thẻ để mở màn phụ (vd công thức đồ thành phẩm). Sửa/xoá vẫn nằm ở hai nút riêng. */
  onRowPress?: (item: T) => void;
}

const PAGE_SIZE = 20;

function buildPayload(fields: CatalogFieldConfig[], values: Record<string, string>) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? "";
    if (field.type === "number") {
      payload[field.name] = raw === "" ? (field.required ? 0 : undefined) : Number(raw);
    } else if (field.type === "checkbox") {
      payload[field.name] = raw === "true";
    } else {
      payload[field.name] = raw || undefined;
    }
  }
  return payload;
}

/**
 * Màn danh mục dùng chung — cùng vai trò với CatalogPage bên web: mỗi trang danh mục chỉ là một
 * file cấu hình cột hiển thị + trường nhập, không viết lại CRUD.
 */
export function CatalogScreen<T extends { id: string }>({
  title,
  resource,
  endpoint,
  queryKey,
  fields,
  renderRow,
  toFormValues,
  filters,
  onRowPress,
}: CatalogScreenProps<T>) {
  const queryClient = useQueryClient();
  const { can } = useCan();
  const canAdd = can(resource, "ADD");
  const canEdit = can(resource, "EDIT");
  const canDelete = can(resource, "DELETE");

  const [search, setSearch] = useState("");
  const [modalItem, setModalItem] = useState<T | "new" | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Ô tìm kiếm nối thẳng vào queryKey, nên không hoãn lại thì mỗi ký tự là một lượt gọi API.
  const debouncedSearch = useDebouncedValue(search);

  // Tên các ô lọc cố định ngay từ lần dựng đầu (options nạp sau không đổi tên), nên lấy làm mốc được.
  const filterSheet = useFilterSheet(() =>
    Object.fromEntries((filters ?? []).map((f) => [f.name, ""])) as Record<string, string>,
  );
  const filterValues = filterSheet.applied;

  const list = useInfiniteQuery({
    queryKey: ["catalog", queryKey, debouncedSearch, filterValues],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<PagedResult<T>>(endpoint, { search: debouncedSearch, page: pageParam, pageSize: PAGE_SIZE, ...filterValues }),
    // Vẫn lấy 20 dòng mỗi lượt như bản web, chỉ khác là cuộn tới đâu tải tới đó thay vì bấm số trang.
    getNextPageParam: (lastPage, pages) => (pages.length * PAGE_SIZE < lastPage.total ? pages.length + 1 : undefined),
  });

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["catalog", queryKey] });
    queryClient.invalidateQueries({ queryKey: [queryKey, "all"] });
  }

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post(endpoint, payload),
    onSuccess: () => {
      invalidate();
      setModalItem(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu thất bại"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      api.put(`${endpoint}/${id}`, payload),
    onSuccess: () => {
      invalidate();
      setModalItem(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Lưu thất bại"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: invalidate,
  });

  function openCreate() {
    setError(null);
    setFormValues(Object.fromEntries(fields.map((f) => [f.name, f.type === "checkbox" ? "true" : ""])));
    setModalItem("new");
  }

  function openEdit(item: T) {
    setError(null);
    const values = toFormValues ? toFormValues(item) : (item as unknown as Record<string, string>);
    setFormValues(Object.fromEntries(fields.map((f) => [f.name, String(values[f.name] ?? "")])));
    setModalItem(item);
  }

  function confirmDelete(item: T) {
    Alert.alert("Xoá bản ghi", "Xoá bản ghi này?", [
      { text: "Huỷ", style: "cancel" },
      { text: "Xoá", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  function submit() {
    const payload = buildPayload(fields, formValues);
    if (modalItem === "new") createMutation.mutate(payload);
    else if (modalItem) updateMutation.mutate({ id: modalItem.id, payload });
  }

  // Nhãn của các lựa chọn đang lọc, cho dòng tóm tắt cạnh phễu.
  const filterSummary = (filters ?? [])
    .map((filter) => filter.options.find((option) => option.value === filterValues[filter.name])?.label)
    .filter((label): label is string => Boolean(label));

  const header = (
    <View style={styles.header}>
      {filters && filters.length > 0 ? (
        <FilterBar
          summary={filterSummary}
          activeCount={filterSheet.activeCount}
          onOpen={filterSheet.openSheet}
          search={{ value: search, onChange: setSearch }}
        />
      ) : (
        // Danh mục không có ô lọc nào thì đừng bày ra cái phễu mở lên chẳng có gì.
        <SearchBar value={search} onChange={setSearch} />
      )}

      <View style={styles.summaryRow}>
        <Text style={styles.summary}>Tổng {total}</Text>
        {canAdd ? (
          <Button
            title="Thêm mới"
            size="sm"
            onPress={openCreate}
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
          />
        ) : null}
      </View>
    </View>
  );

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <View style={styles.root}>
      <FilterSheet
        visible={filterSheet.open}
        onClose={filterSheet.close}
        onApply={filterSheet.apply}
        onClear={filterSheet.clear}
      >
        {(filters ?? []).map((filter) => (
          <Select
            key={filter.name}
            label={filter.label}
            value={filterSheet.draft[filter.name] ?? ""}
            onChange={(value) => filterSheet.patchDraft({ [filter.name]: value })}
            emptyLabel={`Tất cả ${filter.label.toLowerCase()}`}
            options={filter.options}
          />
        ))}
      </FilterSheet>

      <DataList
        data={items}
        header={header}
        keyExtractor={(item) => item.id}
        isLoading={list.isLoading}
        isRefetching={list.isRefetching}
        onRefresh={() => list.refetch()}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        isFetchingMore={list.isFetchingNextPage}
        renderItem={(item) => {
          const row = renderRow(item);
          return (
            <ListRowCard
              title={row.title}
              subtitle={row.subtitle}
              meta={row.meta}
              badge={row.badge}
              onPress={onRowPress ? () => onRowPress(item) : undefined}
              onEdit={canEdit ? () => openEdit(item) : undefined}
              onDelete={canDelete ? () => confirmDelete(item) : undefined}
            />
          );
        }}
      />

      <Modal
        visible={modalItem !== null}
        title={modalItem === "new" ? `Thêm ${title.toLowerCase()}` : `Sửa ${title.toLowerCase()}`}
        onClose={() => setModalItem(null)}
        footer={<Button title="Lưu" fullWidth loading={saving} onPress={submit} />}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {fields.map((field) => {
            const value = formValues[field.name] ?? "";
            const setValue = (next: string) => setFormValues((prev) => ({ ...prev, [field.name]: next }));

            if (field.type === "select") {
              return (
                <Select
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  value={value}
                  onChange={setValue}
                  options={field.options ?? []}
                  placeholder={`Chọn ${field.label.toLowerCase()}`}
                />
              );
            }

            if (field.type === "checkbox") {
              return (
                <View key={field.name} style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{field.label}</Text>
                  <Switch
                    value={value === "true"}
                    onValueChange={(next) => setValue(next ? "true" : "false")}
                    trackColor={{ true: colors.primary, false: colors.borderStrong }}
                  />
                </View>
              );
            }

            return (
              <Input
                key={field.name}
                label={field.label}
                required={field.required}
                value={value}
                onChangeText={setValue}
                keyboardType={field.type === "number" ? "numeric" : "default"}
                multiline={field.type === "textarea"}
              />
            );
          })}

          {error ? (
            <Field>
              <Text style={styles.error}>{error}</Text>
            </Field>
          ) : null}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: { fontSize: fontSize.sm, color: colors.textMuted },
  form: { padding: spacing.lg, gap: spacing.lg },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  switchLabel: { fontSize: fontSize.sm, fontWeight: "600", color: colors.textMuted },
  error: { fontSize: fontSize.sm, color: colors.danger },
});
