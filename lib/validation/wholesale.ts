import { z } from "zod";

export const wholesaleLineSchema = z.object({
  product_id: z.string().min(1, "Select a product"),
  product_name_snapshot: z.string(),
  quantity: z.number().int().positive("Quantity must be greater than zero"),
  unit_price: z.number().positive("Unit price must be greater than zero"),
});

export const createWholesaleDocSchema = z.object({
  type: z.enum(["proforma", "invoice"]),
  customer_id: z.string().min(1, "Select a customer"),
  customer_name_snapshot: z.string(),
  customer_phone_snapshot: z.string().optional(),
  customer_address_snapshot: z.string().optional(),
  payment_method: z.enum(["cash", "momo", "card", "credit"]).optional(),
  discount_amount: z.number().min(0),
  notes: z.string().trim().optional(),
  lines: z.array(wholesaleLineSchema).min(1, "Add at least one product"),
});

export type CreateWholesaleDocInput = z.infer<typeof createWholesaleDocSchema>;
