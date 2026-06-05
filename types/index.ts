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

export type SinglePaymentMethod = "cash" | "momo" | "card";
export type PaymentMethod = SinglePaymentMethod | "split";

export interface PaymentSplit {
  method: SinglePaymentMethod;
  amount: number;
}

export interface SaleDiscount {
  type: "pct" | "fixed";
  value: number;
}

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
  discount?: SaleDiscount | null;
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

export interface PosSettings {
  discount_threshold_pct: number;
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
  subtotal: number;
  discount_amount: number;
  total: number;
  payment_method: PaymentMethod;
  payment_splits?: PaymentSplit[];
  amount_tendered: number;
  change: number;
  item_count: number;
}

export type AdjustmentType = "correction" | "damage" | "expiry_write_off" | "other";

export interface StockTransaction {
  id: string;
  batch_id: string;
  product_id: string;
  product_name_snapshot: string;
  batch_number_snapshot: string;
  type: "receipt" | "sale" | "adjustment" | "recall" | "return";
  adjustment_type?: AdjustmentType;
  quantity_change: number;
  quantity_after: number;
  reason: string;
  reference_type?: string;
  reference_id?: string;
  shop_context: "retail" | "wholesale" | "shared";
  created_at: FirestoreDate;
  created_by: string;
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
  payment_splits?: PaymentSplit[];
  amount_tendered: number;
  change: number;
  item_count: number;
  line_count: number;
  created_by: string;
  created_by_name_snapshot: string;
}

export interface SaleLineItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  batch_id: string;
  batch_number_snapshot: string;
  quantity: number;
  unit_price: number;
  cost_price_snapshot: number;
  line_total: number;
}

export interface ReturnLine {
  sale_line_item_id?: string;
  product_id: string;
  product_name_snapshot: string;
  batch_id: string;
  batch_number_snapshot: string;
  quantity_returned: number;
  unit_price: number;
  line_total: number;
}

export type WholesalePaymentMethod = "cash" | "momo" | "card" | "credit";
export type WholesaleDocStatus = "draft" | "confirmed" | "partially_paid" | "paid" | "void";
export type WholesaleDocType = "proforma" | "invoice";

export interface WholesaleLineItem {
  product_id: string;
  product_name_snapshot: string;
  batch_id?: string;
  batch_number_snapshot?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface WholesaleDocument {
  id: string;
  type: WholesaleDocType;
  doc_number: string;
  customer_id: string;
  customer_name_snapshot: string;
  customer_phone_snapshot?: string;
  customer_address_snapshot?: string;
  line_items: WholesaleLineItem[];
  subtotal: number;
  discount_amount: number;
  total: number;
  payment_method?: WholesalePaymentMethod;
  amount_paid: number;
  proforma_id?: string;
  notes?: string;
  status: WholesaleDocStatus;
  created_at: FirestoreDate;
  updated_at?: FirestoreDate;
  created_by: string;
  created_by_name_snapshot: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  customer_type: "retail" | "wholesale" | "both";
  credit_limit: number;
  current_balance: number;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: FirestoreDate;
  updated_at: FirestoreDate;
  created_by: string;
}

export interface Supplier {
  id: string;
  name: string;
  supplier_code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_active: boolean;
  created_at: FirestoreDate;
  updated_at: FirestoreDate;
  created_by: string;
}

export interface PurchaseOrderLine {
  product_id: string;
  product_name_snapshot: string;
  quantity_ordered: number;
  unit_cost: number;
  line_total: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name_snapshot: string;
  order_date: FirestoreDate;
  expected_delivery_date?: FirestoreDate;
  status: "draft" | "sent" | "partially_received" | "received" | "cancelled";
  line_items: PurchaseOrderLine[];
  total_value: number;
  notes?: string;
  created_at: FirestoreDate;
  created_by: string;
  created_by_name_snapshot: string;
}

export interface GrnLine {
  product_id: string;
  product_name_snapshot: string;
  batch_id: string;
  batch_number: string;
  expiry_date: string;
  quantity_received: number;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  shop_context: "retail" | "wholesale" | "shared";
}

export interface GoodsReceivedNote {
  id: string;
  grn_number: string;
  po_id?: string;
  po_number_snapshot?: string;
  supplier_id?: string;
  supplier_name_snapshot?: string;
  received_date: FirestoreDate;
  status: "completed";
  lines: GrnLine[];
  total_value: number;
  notes?: string;
  created_at: FirestoreDate;
  created_by: string;
  created_by_name_snapshot: string;
}

export interface SaleReturn {
  id: string;
  original_sale_id: string;
  return_date: FirestoreDate;
  status: "completed";
  return_lines: ReturnLine[];
  total_refund: number;
  refund_method: SinglePaymentMethod;
  notes: string;
  created_by: string;
  created_by_name_snapshot: string;
}
