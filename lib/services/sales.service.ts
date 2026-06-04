import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { allocateFefoStock, sellableFefoBatches } from "@/lib/utils/fefo";
import type { Batch, PaymentMethod, PosCartItem } from "@/types";

interface SaleActor {
  uid: string;
  name: string;
  role: string;
}

interface CheckoutRetailSaleInput {
  items: PosCartItem[];
  batches: Batch[];
  payment_method: PaymentMethod;
  amount_tendered?: number;
}

export interface RetailSaleResult {
  sale_id: string;
  total: number;
  change: number;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function checkoutRetailSale(
  input: CheckoutRetailSaleInput,
  actor: SaleActor,
): Promise<RetailSaleResult> {
  if (input.items.length === 0) {
    throw new Error("Add at least one product before checkout.");
  }

  const db = getFirebaseDb();
  const saleRef = doc(collection(db, "saleTransactions"));
  const productIds = new Set(input.items.map((item) => item.product_id));
  const candidateBatches = sellableFefoBatches(input.batches).filter((batch) =>
    productIds.has(batch.product_id),
  );
  const candidateRefs = candidateBatches.map((batch) => doc(db, "batches", batch.id));

  return runTransaction(db, async (transaction) => {
    const batchSnapshots = await Promise.all(
      candidateRefs.map((batchRef) => transaction.get(batchRef)),
    );
    const currentBatches = batchSnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Batch);
    const saleLines: Array<{
      item: PosCartItem;
      batch: Batch;
      quantity: number;
      unit_price: number;
      line_total: number;
    }> = [];

    for (const item of input.items) {
      const allocation = allocateFefoStock(
        currentBatches.filter((batch) => batch.product_id === item.product_id),
        item.quantity,
      );

      if (!allocation.fulfilled) {
        throw new Error(
          `${item.product_name_snapshot} has only ${allocation.available} sellable units available.`,
        );
      }

      for (const allocated of allocation.allocations) {
        saleLines.push({
          item,
          batch: allocated.batch,
          quantity: allocated.quantity,
          unit_price: allocated.batch.retail_price,
          line_total: money(allocated.quantity * allocated.batch.retail_price),
        });
      }
    }

    const total = money(saleLines.reduce((sum, line) => sum + line.line_total, 0));
    const tendered =
      input.payment_method === "cash" ? money(input.amount_tendered ?? 0) : total;

    if (input.payment_method === "cash" && tendered < total) {
      throw new Error(`Cash received is below the sale total of GHS ${total.toFixed(2)}.`);
    }

    const quantityByBatch = new Map<string, number>();
    for (const line of saleLines) {
      quantityByBatch.set(
        line.batch.id,
        (quantityByBatch.get(line.batch.id) ?? 0) + line.quantity,
      );
    }

    for (const [batchId, quantity] of quantityByBatch) {
      const currentBatch = currentBatches.find((batch) => batch.id === batchId);

      if (!currentBatch) {
        throw new Error("A selected batch is no longer available.");
      }

      const quantityAfter = currentBatch.quantity_remaining - quantity;
      transaction.update(doc(db, "batches", batchId), {
        quantity_remaining: quantityAfter,
        status: quantityAfter === 0 ? "depleted" : "active",
        last_sale_id: saleRef.id,
      });

      transaction.set(doc(collection(db, "stockTransactions")), {
        batch_id: batchId,
        product_id: currentBatch.product_id,
        product_name_snapshot: currentBatch.product_name_snapshot,
        batch_number_snapshot: currentBatch.batch_number,
        type: "sale",
        quantity_change: -quantity,
        quantity_after: quantityAfter,
        reason: "Retail sale",
        reference_type: "sale",
        reference_id: saleRef.id,
        shop_context: currentBatch.shop_context,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    for (const line of saleLines) {
      transaction.set(doc(collection(db, "saleLineItems")), {
        sale_id: saleRef.id,
        product_id: line.item.product_id,
        product_name_snapshot: line.item.product_name_snapshot,
        batch_id: line.batch.id,
        batch_number_snapshot: line.batch.batch_number,
        quantity: line.quantity,
        unit_price: line.unit_price,
        cost_price_snapshot: line.batch.cost_price,
        line_total: line.line_total,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    const change = money(tendered - total);
    transaction.set(saleRef, {
      sale_date: serverTimestamp(),
      channel: "retail",
      status: "completed",
      subtotal: total,
      discount_total: 0,
      total,
      payment_method: input.payment_method,
      amount_tendered: tendered,
      change,
      item_count: input.items.reduce((sum, item) => sum + item.quantity, 0),
      line_count: saleLines.length,
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "RETAIL_SALE_COMPLETED",
      entity_type: "sale",
      entity_id: saleRef.id,
      details: {
        total,
        payment_method: input.payment_method,
        item_count: input.items.reduce((sum, item) => sum + item.quantity, 0),
      },
    });

    return { sale_id: saleRef.id, total, change };
  });
}
