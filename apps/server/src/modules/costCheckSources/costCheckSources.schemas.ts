import { z } from "zod";

export const costCheckSourcesQuerySchema = z.object({
  productId: z.string().min(1, "Thiếu nguyên liệu cần xem"),
});
