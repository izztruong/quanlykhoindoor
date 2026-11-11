import { Badge } from "@/components/ui/Badge";
import { labels } from "@/lib/format";
import type { BakeryOrderStatus } from "@/types";

const TONE: Record<BakeryOrderStatus, "gray" | "green" | "yellow" | "blue"> = {
  ORDERED: "yellow",
  CONFIRMED: "blue",
  IN_TRANSIT: "blue",
  COMPLETED: "green",
  CANCELLED: "gray",
};

export function BakeryOrderStatusBadge({ status }: { status: BakeryOrderStatus }) {
  return <Badge tone={TONE[status]}>{labels.bakeryOrderStatus(status)}</Badge>;
}
