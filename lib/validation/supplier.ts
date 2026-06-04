import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string().trim().min(2, "Supplier name is required"),
  supplier_code: z.string().trim().optional(),
  contact_person: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  is_active: z.boolean(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
