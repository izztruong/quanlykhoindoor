import { z } from "zod";

export const shiftPrepTargetsPutSchema = z.object({
  userId: z.string().min(1),
  items: z
    .array(
      z
        .object({
          finishedGoodItemId: z.string().min(1),
          shift: z.enum(["CA1", "CA2", "CA3"]),
          mode: z.enum(["TARGET_LEVEL", "FORECAST", "OFF"]),
          targetLevel: z.coerce.number().nonnegative().nullable().optional(),
        })
        // Chế độ TARGET_LEVEL mà không có mức mục tiêu thì không đề xuất được gì, nên chặn ngay ở đây
        // thay vì để màn Chuẩn bị ca hiện một dòng "chưa khai" mà người dùng tưởng là lỗi.
        .superRefine((item, ctx) => {
          if (item.mode === "TARGET_LEVEL" && item.targetLevel == null) {
            ctx.addIssue({
              code: "custom",
              path: ["targetLevel"],
              message: "Chế độ theo mức mục tiêu thì phải nhập mức mục tiêu",
            });
          }
        }),
    )
    .max(3000),
});
