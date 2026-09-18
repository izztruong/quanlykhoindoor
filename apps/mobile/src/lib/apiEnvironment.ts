import type { BadgeTone } from "@/components/ui/Badge";

export interface ApiEnvironment {
  label: string;
  tone: BadgeTone;
}

/**
 * Suy từ chính URL app đang gọi chứ không từ biến riêng, để nhãn không bao giờ nói sai: build thiếu env
 * rơi về localhost cũng hiện LOCAL. `null` = production, không hiện nhãn cho người dùng thật.
 */
export function apiEnvironment(apiUrl: string): ApiEnvironment | null {
  if (apiUrl.includes("quanlykhoindoor1.onrender.com")) return null;
  if (apiUrl.includes("quanlykhoindoortest.onrender.com")) return { label: "STAGING", tone: "blue" };
  const host = apiUrl.replace(/^\w+:\/\//, "").split(/[/:]/)[0];
  return { label: `LOCAL · ${host}`, tone: "yellow" };
}
