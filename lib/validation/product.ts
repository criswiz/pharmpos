import { z } from "zod";

export const productSchema = z.object({
  name_generic: z.string().min(2, "Generic name is required"),
  name_brand: z.string().min(2, "Brand name is required"),
  category: z.string().min(2, "Category is required"),
  barcode_primary: z.string().min(4, "Primary barcode is required"),
  barcode_internal: z.string().optional(),
  unit_of_measure: z.enum(["tablet", "capsule", "bottle", "sachet", "carton"]),
  pack_size: z.string().min(1, "Pack size is required"),
  smallest_unit: z.string().min(1, "Smallest unit is required"),
  manufacturer: z.string().optional(),
  country_of_origin: z.string().optional(),
  fda_registration_number: z.string().optional(),
  storage_conditions: z.enum(["refrigerate", "room_temp", "cool_dry"]),
  reorder_threshold: z.number().int().min(0),
  image_url: z.string().url().optional().or(z.literal("")),
  is_active: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;
