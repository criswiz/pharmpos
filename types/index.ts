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
  created_at: FirestoreDate;
  created_by: string;
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
