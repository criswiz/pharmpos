import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required"),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
  customer_type: z.enum(["retail", "wholesale", "both"]),
  credit_limit: z.number().min(0, "Credit limit cannot be negative"),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  is_active: z.boolean(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
