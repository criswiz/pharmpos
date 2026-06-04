import { z } from "zod";

const dateField = z
  .string()
  .min(1, "Date is required")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00.000Z`)), "Enter a valid date");

export const grnLineSchema = z
  .object({
    product_id: z.string().min(1, "Select a product"),
    batch_number: z.string().trim().min(1, "Batch number is required").max(80),
    manufacture_date: z.string().optional(),
    expiry_date: dateField,
    quantity_received: z.number().int().positive("Quantity must be greater than zero"),
    cost_price: z.number().min(0, "Cost price cannot be negative"),
    retail_price: z.number().positive("Retail price must be greater than zero"),
    wholesale_price: z.number().positive("Wholesale price must be greater than zero"),
    shop_context: z.enum(["retail", "wholesale", "shared"]),
  })
  .superRefine((input, ctx) => {
    if (input.retail_price < input.cost_price) {
      ctx.addIssue({ code: "custom", path: ["retail_price"], message: "Retail price cannot be below cost price" });
    }
    if (input.wholesale_price < input.cost_price) {
      ctx.addIssue({ code: "custom", path: ["wholesale_price"], message: "Wholesale price cannot be below cost price" });
    }
    if (input.manufacture_date) {
      if (Number.isNaN(Date.parse(`${input.manufacture_date}T00:00:00.000Z`))) {
        ctx.addIssue({ code: "custom", path: ["manufacture_date"], message: "Enter a valid manufacture date" });
      }
    }
  });

export const grnSchema = z.object({
  supplier_id: z.string().optional(),
  supplier_name_snapshot: z.string().trim().optional(),
  po_id: z.string().trim().optional(),
  po_number_snapshot: z.string().trim().optional(),
  received_date: dateField,
  notes: z.string().trim().optional(),
  lines: z.array(grnLineSchema).min(1, "Add at least one line item"),
});

export type GrnInput = z.infer<typeof grnSchema>;
export type GrnLineInput = z.infer<typeof grnLineSchema>;
