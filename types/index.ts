import type { Timestamp } from "firebase/firestore";

export type UserRole =
  | "OWNER"
  | "STORE_MANAGER"
  | "RETAIL_STAFF"
  | "WHOLESALE_STAFF"
  | "SYS_ADMIN";

export type Permission =
  | "dashboard:read"
  | "pos:write"
  | "wholesale:write"
  | "inventory:write"
  | "purchasing:write"
  | "customers:write"
  | "suppliers:write"
  | "trace:read"
  | "reports:read"
  | "settings:write"
  | "users:write"
  | "audit:read";

export type FirestoreDate = Timestamp | Date;

export interface RoleRecord {
  role: UserRole;
  permissions: Permission[];
  shopAccess: Array<"retail" | "wholesale" | "shared">;
}

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  active: boolean;
  locked: boolean;
  failed_attempts: number;
  isFirstLogin: boolean;
  last_login?: FirestoreDate;
  created_at?: FirestoreDate;
}

export interface Product {
  id: string;
  name_generic: string;
  name_brand: string;
  category: string;
  barcode_primary: string;
  barcode_internal?: string;
  unit_of_measure: "tablet" | "capsule" | "bottle" | "sachet" | "carton";
  pack_size: string;
  smallest_unit: string;
  manufacturer?: string;
  country_of_origin?: string;
  fda_registration_number?: string;
  storage_conditions: "refrigerate" | "room_temp" | "cool_dry";
  reorder_threshold: number;
  image_url?: string;
  is_active: boolean;
  created_at: FirestoreDate;
  updated_at: FirestoreDate;
  created_by: string;
}

export interface Batch {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  batch_number: string;
  supplier_id?: string;
  supplier_name_snapshot?: string;
  purchase_date: FirestoreDate;
  manufacture_date?: FirestoreDate;
  expiry_date: FirestoreDate;
  quantity_received: number;
  quantity_remaining: number;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  shop_context: "retail" | "wholesale" | "shared";
  status: "active" | "expired" | "recalled" | "depleted";
  grn_id?: string;
  last_sale_id?: string;
  created_at: FirestoreDate;
  created_by: string;
}

export type PaymentMethod = "cash" | "momo" | "card";

export interface PosCartItem {
  product_id: string;
  product_name_snapshot: string;
  product_generic_snapshot: string;
  barcode_snapshot: string;
  quantity: number;
}

export interface ParkedSale {
  id: string;
  label: string;
  parked_at: string;
  items: PosCartItem[];
}

export interface PharmacyInfo {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  fda_number: string;
  logo_url: string;
}

export interface ReceiptLine {
  product_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface ReceiptData {
  sale_id: string;
  sale_date: Date;
  cashier_name: string;
  lines: ReceiptLine[];
  total: number;
  payment_method: PaymentMethod;
  amount_tendered: number;
  change: number;
  item_count: number;
}

export interface SaleTransaction {
  id: string;
  sale_date: FirestoreDate;
  channel: "retail" | "wholesale";
  status: "completed" | "voided";
  subtotal: number;
  discount_total: number;
  total: number;
  payment_method: PaymentMethod;
  amount_tendered: number;
  change: number;
  item_count: number;
  line_count: number;
  created_by: string;
  created_by_name_snapshot: string;
}
