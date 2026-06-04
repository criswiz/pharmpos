import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Batch, Product } from "@/types";
import type { ProductInput } from "@/lib/validation/product";
import type { BatchReceiptInput } from "@/lib/validation/batch";

interface ProductAuditActor {
  uid: string;
  name: string;
  role: string;
}

export function subscribeProducts(
  onProducts: (products: Product[]) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  const productsQuery = query(collection(db, "products"), orderBy("name_generic"));

  return onSnapshot(
    productsQuery,
    (snapshot) => {
      onProducts(
        snapshot.docs.map((productDoc) => ({
          id: productDoc.id,
          ...productDoc.data(),
        })) as Product[],
      );
    },
    onError,
  );
}

export function subscribeBatches(
  onBatches: (batches: Batch[]) => void,
  onError: (error: Error) => void,
) {
  const db = getFirebaseDb();
  const batchesQuery = query(collection(db, "batches"), orderBy("expiry_date"));

  return onSnapshot(
    batchesQuery,
    (snapshot) => {
      onBatches(
        snapshot.docs.map((batchDoc) => ({
          id: batchDoc.id,
          ...batchDoc.data(),
        })) as Batch[],
      );
    },
    onError,
  );
}

export async function createProduct(input: ProductInput, actor: ProductAuditActor) {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const productRef = doc(collection(db, "products"));
  const auditRef = doc(collection(db, "auditLogs"));

  batch.set(productRef, {
    ...input,
    barcode_internal: input.barcode_internal || null,
    manufacturer: input.manufacturer || null,
    country_of_origin: input.country_of_origin || null,
    fda_registration_number: input.fda_registration_number || null,
    image_url: input.image_url || null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: actor.uid,
  });

  batch.set(auditRef, {
    timestamp: serverTimestamp(),
    user_id: actor.uid,
    user_name_snapshot: actor.name,
    user_role_snapshot: actor.role,
    action: "PRODUCT_CREATED",
    entity_type: "product",
    entity_id: productRef.id,
    details: {
      name_generic: input.name_generic,
      name_brand: input.name_brand,
      barcode_primary: input.barcode_primary,
    },
  });

  await batch.commit();
  return productRef.id;
}

function dateTimestamp(value: string, endOfDay = false) {
  const time = endOfDay ? "23:59:59.999" : "12:00:00.000";
  return Timestamp.fromDate(new Date(`${value}T${time}Z`));
}

function batchDocumentId(productId: string, batchNumber: string) {
  return encodeURIComponent(`${productId}:${batchNumber.trim().toUpperCase()}`);
}

export async function receiveBatch(
  input: BatchReceiptInput,
  product: Product,
  actor: ProductAuditActor,
) {
  const db = getFirebaseDb();
  const batchRef = doc(db, "batches", batchDocumentId(product.id, input.batch_number));
  const stockTransactionRef = doc(collection(db, "stockTransactions"));
  const auditRef = doc(collection(db, "auditLogs"));

  await runTransaction(db, async (transaction) => {
    const existingBatch = await transaction.get(batchRef);

    if (existingBatch.exists()) {
      throw new Error("A batch with this number already exists for the selected product.");
    }

    transaction.set(batchRef, {
      product_id: product.id,
      product_name_snapshot: product.name_brand || product.name_generic,
      batch_number: input.batch_number.trim(),
      supplier_id: input.supplier_id || null,
      supplier_name_snapshot: input.supplier_name_snapshot || null,
      purchase_date: dateTimestamp(input.purchase_date),
      manufacture_date: input.manufacture_date
        ? dateTimestamp(input.manufacture_date)
        : null,
      expiry_date: dateTimestamp(input.expiry_date, true),
      quantity_received: input.quantity_received,
      quantity_remaining: input.quantity_received,
      cost_price: input.cost_price,
      retail_price: input.retail_price,
      wholesale_price: input.wholesale_price,
      shop_context: input.shop_context,
      status: "active",
      grn_id: input.grn_id || null,
      created_at: serverTimestamp(),
      created_by: actor.uid,
    });

    transaction.set(stockTransactionRef, {
      batch_id: batchRef.id,
      product_id: product.id,
      product_name_snapshot: product.name_brand || product.name_generic,
      batch_number_snapshot: input.batch_number.trim(),
      type: "receipt",
      quantity_change: input.quantity_received,
      quantity_after: input.quantity_received,
      reason: input.grn_id ? "Goods received" : "Manual opening stock receipt",
      reference_type: input.grn_id ? "grn" : "manual_receipt",
      reference_id: input.grn_id || null,
      shop_context: input.shop_context,
      created_at: serverTimestamp(),
      created_by: actor.uid,
    });

    transaction.set(auditRef, {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "BATCH_RECEIVED",
      entity_type: "batch",
      entity_id: batchRef.id,
      details: {
        product_id: product.id,
        product_name: product.name_brand || product.name_generic,
        batch_number: input.batch_number.trim(),
        quantity_received: input.quantity_received,
        expiry_date: input.expiry_date,
        grn_id: input.grn_id || null,
      },
    });
  });

  return batchRef.id;
}
