import {
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
import { batchDocumentId, dateTimestamp } from "@/lib/services/inventory.service";
import type { GoodsReceivedNote, GrnLine, Product, PurchaseOrder } from "@/types";
import type { GrnInput } from "@/lib/validation/grn";
import type { PurchaseOrderInput } from "@/lib/validation/po";

interface Actor {
  uid: string;
  name: string;
  role: string;
}

function money(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ────── GRN ──────

export function subscribeGrns(
  onData: (grns: GoodsReceivedNote[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, "goodsReceivedNotes"), orderBy("received_date", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as GoodsReceivedNote));
    },
    () => onError(),
  );
}

export async function createGrn(
  input: GrnInput,
  products: Product[],
  actor: Actor,
): Promise<{ grnId: string; grnNumber: string }> {
  const db = getFirebaseDb();
  const grnRef = doc(collection(db, "goodsReceivedNotes"));
  const counterRef = doc(db, "counters", "grn");

  return runTransaction(db, async (transaction) => {
    // Generate GRN number
    const counterSnap = await transaction.get(counterRef);
    const currentYear = new Date().getFullYear();
    const existing = counterSnap.exists() ? counterSnap.data() : null;
    const sequence = existing?.year === currentYear ? (existing.sequence as number) + 1 : 1;
    const grnNumber = `GRN-${currentYear}-${String(sequence).padStart(3, "0")}`;

    // Check for duplicate batches
    const batchRefs = input.lines.map((line) =>
      doc(db, "batches", batchDocumentId(line.product_id, line.batch_number)),
    );
    const batchSnaps = await Promise.all(batchRefs.map((ref) => transaction.get(ref)));

    for (let i = 0; i < batchSnaps.length; i++) {
      if (batchSnaps[i].exists()) {
        const product = products.find((p) => p.id === input.lines[i].product_id);
        throw new Error(
          `Batch "${input.lines[i].batch_number}" already exists for ${product?.name_brand ?? "this product"}.`,
        );
      }
    }

    // Update counter
    transaction.set(counterRef, { year: currentYear, sequence });

    // Create batches + stock transactions
    const grnLines: GrnLine[] = [];
    const purchaseTimestamp = dateTimestamp(input.received_date);

    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      const product = products.find((p) => p.id === line.product_id);
      if (!product) throw new Error(`Product not found for line ${i + 1}.`);

      const nameSnapshot = product.name_brand || product.name_generic;
      const batchRef = batchRefs[i];

      transaction.set(batchRef, {
        product_id: product.id,
        product_name_snapshot: nameSnapshot,
        batch_number: line.batch_number.trim().toUpperCase(),
        supplier_id: input.supplier_id || null,
        supplier_name_snapshot: input.supplier_name_snapshot || null,
        purchase_date: purchaseTimestamp,
        manufacture_date: line.manufacture_date ? dateTimestamp(line.manufacture_date) : null,
        expiry_date: dateTimestamp(line.expiry_date, true),
        quantity_received: line.quantity_received,
        quantity_remaining: line.quantity_received,
        cost_price: line.cost_price,
        retail_price: line.retail_price,
        wholesale_price: line.wholesale_price,
        shop_context: line.shop_context,
        status: "active",
        grn_id: grnRef.id,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });

      transaction.set(doc(collection(db, "stockTransactions")), {
        batch_id: batchRef.id,
        product_id: product.id,
        product_name_snapshot: nameSnapshot,
        batch_number_snapshot: line.batch_number.trim().toUpperCase(),
        type: "receipt",
        quantity_change: line.quantity_received,
        quantity_after: line.quantity_received,
        reason: `Goods received — ${grnNumber}`,
        reference_type: "grn",
        reference_id: grnRef.id,
        shop_context: line.shop_context,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });

      grnLines.push({
        product_id: product.id,
        product_name_snapshot: nameSnapshot,
        batch_id: batchRef.id,
        batch_number: line.batch_number.trim().toUpperCase(),
        expiry_date: line.expiry_date,
        quantity_received: line.quantity_received,
        cost_price: line.cost_price,
        retail_price: line.retail_price,
        wholesale_price: line.wholesale_price,
        shop_context: line.shop_context,
      });
    }

    const totalValue = money(
      input.lines.reduce((sum, l) => sum + l.quantity_received * l.cost_price, 0),
    );

    transaction.set(grnRef, {
      grn_number: grnNumber,
      po_id: input.po_id || null,
      po_number_snapshot: input.po_number_snapshot || null,
      supplier_id: input.supplier_id || null,
      supplier_name_snapshot: input.supplier_name_snapshot || null,
      received_date: purchaseTimestamp,
      status: "completed",
      lines: grnLines,
      total_value: totalValue,
      notes: input.notes || null,
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "GRN_CREATED",
      entity_type: "grn",
      entity_id: grnRef.id,
      details: {
        grn_number: grnNumber,
        supplier: input.supplier_name_snapshot || null,
        line_count: input.lines.length,
        total_value: totalValue,
      },
    });

    return { grnId: grnRef.id, grnNumber };
  });
}

// ────── Purchase Orders ──────

export function subscribePurchaseOrders(
  onData: (orders: PurchaseOrder[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, "purchaseOrders"), orderBy("created_at", "desc")),
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as PurchaseOrder));
    },
    () => onError(),
  );
}

export async function createPurchaseOrder(
  input: PurchaseOrderInput,
  actor: Actor,
): Promise<{ poId: string; poNumber: string }> {
  const db = getFirebaseDb();
  const poRef = doc(collection(db, "purchaseOrders"));
  const counterRef = doc(db, "counters", "po");

  return runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const currentYear = new Date().getFullYear();
    const existing = counterSnap.exists() ? counterSnap.data() : null;
    const sequence = existing?.year === currentYear ? (existing.sequence as number) + 1 : 1;
    const poNumber = `PO-${currentYear}-${String(sequence).padStart(3, "0")}`;

    transaction.set(counterRef, { year: currentYear, sequence });

    const lineItems = input.lines.map((line) => ({
      product_id: line.product_id,
      product_name_snapshot: line.product_name_snapshot,
      quantity_ordered: line.quantity_ordered,
      unit_cost: line.unit_cost,
      line_total: money(line.quantity_ordered * line.unit_cost),
    }));

    const totalValue = money(lineItems.reduce((sum, l) => sum + l.line_total, 0));

    transaction.set(poRef, {
      po_number: poNumber,
      supplier_id: input.supplier_id,
      supplier_name_snapshot: input.supplier_name_snapshot,
      order_date: dateTimestamp(input.order_date),
      expected_delivery_date: input.expected_delivery_date
        ? dateTimestamp(input.expected_delivery_date)
        : null,
      status: "draft",
      line_items: lineItems,
      total_value: totalValue,
      notes: input.notes || null,
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "PURCHASE_ORDER_CREATED",
      entity_type: "purchaseOrder",
      entity_id: poRef.id,
      details: { po_number: poNumber, supplier: input.supplier_name_snapshot, total_value: totalValue },
    });

    return { poId: poRef.id, poNumber };
  });
}

export async function updatePurchaseOrderStatus(
  poId: string,
  status: PurchaseOrder["status"],
  actor: Actor,
): Promise<void> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);

  batch.update(doc(db, "purchaseOrders", poId), {
    status,
    updated_at: serverTimestamp(),
    updated_by: actor.uid,
  });

  batch.set(doc(collection(db, "auditLogs")), {
    timestamp: serverTimestamp(),
    user_id: actor.uid,
    user_name_snapshot: actor.name,
    user_role_snapshot: actor.role,
    action: "PURCHASE_ORDER_STATUS_CHANGED",
    entity_type: "purchaseOrder",
    entity_id: poId,
    details: { new_status: status },
  });

  await batch.commit();
}
