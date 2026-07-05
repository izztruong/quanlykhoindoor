import { z } from "zod";

export const transactionFormEnum = z.enum(["CASH", "BANK_TRANSFER", "DEBT", "OTHER"]);
export const transactionStatusEnum = z.enum(["DRAFT", "COMPLETED", "CANCELLED"]);
export const stockImportTypeEnum = z.enum(["PURCHASE", "CUSTOMER_RETURN", "TRANSFER_IN", "OTHER"]);
export const stockExportTypeEnum = z.enum(["SALE", "SUPPLIER_RETURN", "TRANSFER_OUT", "DAMAGE", "OTHER"]);

export const stockItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  costPrice: z.coerce.number().nonnegative(),
  note: z.string().optional(),
});

const baseHeaderSchema = {
  transactionAt: z.coerce.date(),
  form: transactionFormEnum.default("CASH"),
  status: transactionStatusEnum.default("COMPLETED"),
  note: z.string().optional(),
  warehouseId: z.string().min(1),
  supplierId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
  items: z.array(stockItemSchema).min(1, "Cần ít nhất 1 hàng hoá"),
};

export const stockImportCreateSchema = z.object({
  type: stockImportTypeEnum.default("PURCHASE"),
  ...baseHeaderSchema,
});

export const stockExportCreateSchema = z.object({
  type: stockExportTypeEnum.default("SALE"),
  ...baseHeaderSchema,
});

export type StockImportInput = z.infer<typeof stockImportCreateSchema>;
export type StockExportInput = z.infer<typeof stockExportCreateSchema>;
