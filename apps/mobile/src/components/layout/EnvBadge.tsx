import { Badge } from "@/components/ui/Badge";
import { API_URL } from "@/lib/apiClient";
import { apiEnvironment } from "@/lib/apiEnvironment";

const env = apiEnvironment(API_URL);

/** Nhãn LOCAL/STAGING để không nhầm bản thử với bản thật; production không hiện gì. */
export function EnvBadge() {
  return env ? <Badge tone={env.tone}>{env.label}</Badge> : null;
}
