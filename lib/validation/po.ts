import { z } from "zod";

const dateField = z
  .string()
  .min(1, "Date is required")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), "Enter a valid date");

export const poLineSchema = z.object({
  product_id: z.string().min(1, "Select a product"),
  product_name_snapshot: z.string(),
  quantity_ordered: z.number().int().positive("Quantity must be greater than zero"),
  unit_cost: z.number().min(0, "Unit cost cannot be negative"),
});

export const purchaseOrderSchema = z.object({
  supplier_id: z.string().min(1, "Select a supplier"),
  supplier_name_snapshot: z.string(),
  order_date: dateField,
  expected_delivery_date: z.string().optional(),
  notes: z.string().trim().optional(),
  lines: z.array(poLineSchema).min(1, "Add at least one product"),
});

export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type PoLineInput = z.infer<typeof poLineSchema>;
