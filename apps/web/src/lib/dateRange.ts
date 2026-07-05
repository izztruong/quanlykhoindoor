const MAX_RANGE_MONTHS = 3;

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Keeps a from/to date pair within a 3-month span. Call this from whichever
 * input just changed, passing which field that was, so the *other* field
 * gets pulled back into range instead of the one the user is actively
 * editing (e.g. moving "from" forward drags "to" along with it).
 */
export function clampDateRange(from: string, to: string, changed: "from" | "to"): { from: string; to: string } {
  if (!from || !to) return { from, to };
  if (from > to) return { from, to };

  const maxTo = addMonths(from, MAX_RANGE_MONTHS);
  if (to <= maxTo) return { from, to };

  if (changed === "from") {
    return { from, to: maxTo };
  }
  return { from: addMonths(to, -MAX_RANGE_MONTHS), to };
}
