import { z } from "zod";

const dateField = z
  .string()
  .min(1, "Date is required")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), "Enter a valid date");

export const batchReceiptSchema = z
  .object({
    product_id: z.string().min(1, "Select a product"),
    batch_number: z.string().trim().min(1, "Batch number is required").max(80),
    supplier_id: z.string().trim().optional(),
    supplier_name_snapshot: z.string().trim().optional(),
    purchase_date: dateField,
    manufacture_date: z.string().optional(),
    expiry_date: dateField,
    quantity_received: z.number().int().positive("Quantity must be greater than zero"),
    cost_price: z.number().min(0, "Cost price cannot be negative"),
    retail_price: z.number().positive("Retail price must be greater than zero"),
    wholesale_price: z.number().positive("Wholesale price must be greater than zero"),
    shop_context: z.enum(["retail", "wholesale", "shared"]),
    grn_id: z.string().trim().optional(),
  })
  .superRefine((input, context) => {
    if (input.expiry_date <= input.purchase_date) {
      context.addIssue({
        code: "custom",
        path: ["expiry_date"],
        message: "Expiry date must be after the purchase date",
      });
    }

    if (input.manufacture_date) {
      const validManufactureDate = !Number.isNaN(
        Date.parse(`${input.manufacture_date}T00:00:00.000Z`),
      );

      if (!validManufactureDate) {
        context.addIssue({
          code: "custom",
          path: ["manufacture_date"],
          message: "Enter a valid manufacture date",
        });
      } else if (input.manufacture_date > input.purchase_date) {
        context.addIssue({
          code: "custom",
          path: ["manufacture_date"],
          message: "Manufacture date cannot be after the purchase date",
        });
      }
    }

    if (input.retail_price < input.cost_price) {
      context.addIssue({
        code: "custom",
        path: ["retail_price"],
        message: "Retail price cannot be below cost price",
      });
    }

    if (input.wholesale_price < input.cost_price) {
      context.addIssue({
        code: "custom",
        path: ["wholesale_price"],
        message: "Wholesale price cannot be below cost price",
      });
    }
  });

export type BatchReceiptInput = z.infer<typeof batchReceiptSchema>;
