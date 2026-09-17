import { Text, View, Pressable } from "react-native";
import { SearchBar } from "@/components/ui/SearchBar";
import { filterSuggestions } from "@/lib/searchSuggestions";
import { colors, spacing } from "@/lib/theme";
import type { Product } from "@/types";

export function ProductAdder({ products, selectedIds, search, onSearch, onAdd }: {
  products: Product[]; selectedIds: Set<string>; search: string; onSearch: (s: string) => void; onAdd: (p: Product) => void;
}) {
  const suggestions = filterSuggestions(products, selectedIds, search);
  return <View style={{ gap: spacing.sm }}>
    <SearchBar value={search} onChange={onSearch} placeholder="Thêm hàng hoá: tìm mã hoặc tên" />
    {suggestions.map((p) => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Thêm ${p.name}`}
      onPress={() => onAdd(p)} style={{ padding: spacing.md, backgroundColor: colors.surface, borderRadius: 8 }}>
      <Text style={{ color: colors.primary, fontWeight: "600" }}>{p.name}</Text>
      <Text style={{ color: colors.textMuted }}>{p.code} · {p.unit.name}</Text>
    </Pressable>)}
    {search.trim() && !suggestions.length ? <Text style={{ color: colors.textMuted }}>Không có hàng hoá phù hợp để thêm.</Text> : null}
  </View>;
}
