/**
 * Shared "type to search" suggestion filter used by every hàng-hoá/đồ-thành-phẩm picker
 * (stock-checks/new, material-waste/new, material-transfers/new): match by code or name,
 * exclude items already added to the current row list, cap the dropdown at 8 results.
 */
export function filterSuggestions<T extends { id: string; code: string; name: string }>(
  items: T[],
  excludeIds: Set<string>,
  query: string,
  limit = 8,
): T[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  return items.filter((it) => !excludeIds.has(it.id) && (it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))).slice(0, limit);
}
