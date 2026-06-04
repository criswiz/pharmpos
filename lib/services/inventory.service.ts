import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Batch, Product, StockTransaction } from "@/types";
import type { ProductInput } from "@/lib/validation/product";
import type { BatchReceiptInput, StockAdjustmentInput } from "@/lib/validation/batch";

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

export function dateTimestamp(value: string, endOfDay = false) {
  const time = endOfDay ? "23:59:59.999" : "12:00:00.000";
  return Timestamp.fromDate(new Date(`${value}T${time}Z`));
}

export function batchDocumentId(productId: string, batchNumber: string) {
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

interface AdjustActor {
  uid: string;
  name: string;
  role: string;
}

export async function adjustBatchStock(
  batchId: string,
  input: StockAdjustmentInput,
  actor: AdjustActor,
): Promise<{ quantityAfter: number }> {
  const delta = input.direction === "add" ? input.quantity : -input.quantity;
  const db = getFirebaseDb();
  const batchRef = doc(db, "batches", batchId);

  return runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error("Batch not found.");

    const batch = { id: batchSnap.id, ...batchSnap.data() } as Batch;

    if (batch.status === "recalled") {
      throw new Error("Cannot adjust a recalled batch.");
    }

    const quantityAfter = batch.quantity_remaining + delta;
    if (quantityAfter < 0) {
      throw new Error(
        `Adjustment of ${delta} would reduce stock below zero. Current remaining: ${batch.quantity_remaining}.`,
      );
    }

    transaction.update(batchRef, {
      quantity_remaining: quantityAfter,
      status: quantityAfter === 0 ? "depleted" : "active",
    });

    transaction.set(doc(collection(db, "stockTransactions")), {
      batch_id: batchId,
      product_id: batch.product_id,
      product_name_snapshot: batch.product_name_snapshot,
      batch_number_snapshot: batch.batch_number,
      type: "adjustment",
      adjustment_type: input.adjustment_type,
      quantity_change: delta,
      quantity_after: quantityAfter,
      reason: input.reason,
      reference_type: "manual_adjustment",
      reference_id: null,
      shop_context: batch.shop_context,
      created_at: serverTimestamp(),
      created_by: actor.uid,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "BATCH_STOCK_ADJUSTED",
      entity_type: "batch",
      entity_id: batchId,
      details: {
        product_name: batch.product_name_snapshot,
        batch_number: batch.batch_number,
        delta,
        quantity_before: batch.quantity_remaining,
        quantity_after: quantityAfter,
        adjustment_type: input.adjustment_type,
        reason: input.reason,
      },
    });

    return { quantityAfter };
  });
}

export async function recallBatch(
  batchId: string,
  reason: string,
  actor: AdjustActor,
): Promise<void> {
  const db = getFirebaseDb();
  const batchRef = doc(db, "batches", batchId);

  await runTransaction(db, async (transaction) => {
    const batchSnap = await transaction.get(batchRef);
    if (!batchSnap.exists()) throw new Error("Batch not found.");

    const batch = { id: batchSnap.id, ...batchSnap.data() } as Batch;

    if (batch.status === "recalled") throw new Error("This batch is already recalled.");
    if (batch.status === "depleted") throw new Error("Cannot recall a depleted batch.");

    transaction.update(batchRef, { status: "recalled" });

    if (batch.quantity_remaining > 0) {
      transaction.set(doc(collection(db, "stockTransactions")), {
        batch_id: batchId,
        product_id: batch.product_id,
        product_name_snapshot: batch.product_name_snapshot,
        batch_number_snapshot: batch.batch_number,
        type: "recall",
        quantity_change: -batch.quantity_remaining,
        quantity_after: 0,
        reason,
        reference_type: "recall",
        reference_id: null,
        shop_context: batch.shop_context,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "BATCH_RECALLED",
      entity_type: "batch",
      entity_id: batchId,
      details: {
        product_name: batch.product_name_snapshot,
        batch_number: batch.batch_number,
        quantity_written_off: batch.quantity_remaining,
        reason,
      },
    });
  });
}

export function subscribeBatchMovements(
  batchId: string,
  onData: (transactions: StockTransaction[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(
      collection(db, "stockTransactions"),
      where("batch_id", "==", batchId),
      orderBy("created_at", "desc"),
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as StockTransaction),
      );
    },
    () => onError(),
  );
}
