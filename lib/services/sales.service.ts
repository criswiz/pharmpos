import {
  Timestamp,
  collection,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { allocateFefoStock, sellableFefoBatches } from "@/lib/utils/fefo";
import type {
  Batch,
  PaymentMethod,
  PaymentSplit,
  PosCartItem,
  ReceiptData,
  ReceiptLine,
  ReturnLine,
  SaleDiscount,
  SaleLineItem,
  SaleReturn,
  SaleTransaction,
  SinglePaymentMethod,
} from "@/types";

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
  payment_splits?: PaymentSplit[];
  discount?: SaleDiscount | null;
}

export interface RetailSaleResult {
  sale_id: string;
  total: number;
  change: number;
  receipt: ReceiptData;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function computeDiscount(subtotal: number, discount: SaleDiscount | null | undefined): number {
  if (!discount || discount.value <= 0) return 0;
  const raw = discount.type === "pct"
    ? subtotal * (discount.value / 100)
    : discount.value;
  return money(Math.min(raw, subtotal));
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

    const subtotal = money(saleLines.reduce((sum, line) => sum + line.line_total, 0));
    const discountAmount = computeDiscount(subtotal, input.discount);
    const total = money(subtotal - discountAmount);

    let amountTendered: number;
    let change: number;
    let paymentMethod: PaymentMethod;

    if (input.payment_splits && input.payment_splits.length > 0) {
      amountTendered = money(input.payment_splits.reduce((sum, s) => sum + s.amount, 0));
      if (amountTendered < total) {
        throw new Error(`Split payment total (GHS ${amountTendered.toFixed(2)}) is below the sale total of GHS ${total.toFixed(2)}.`);
      }
      change = money(amountTendered - total);
      paymentMethod = "split";
    } else {
      paymentMethod = input.payment_method as SinglePaymentMethod;
      amountTendered = paymentMethod === "cash" ? money(input.amount_tendered ?? 0) : total;
      if (paymentMethod === "cash" && amountTendered < total) {
        throw new Error(`Cash received is below the sale total of GHS ${total.toFixed(2)}.`);
      }
      change = money(amountTendered - total);
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

    const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);

    const saleDoc: Record<string, unknown> = {
      sale_date: serverTimestamp(),
      channel: "retail",
      status: "completed",
      subtotal,
      discount_total: discountAmount,
      total,
      payment_method: paymentMethod,
      amount_tendered: amountTendered,
      change,
      item_count: itemCount,
      line_count: saleLines.length,
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    };

    if (input.payment_splits && input.payment_splits.length > 0) {
      saleDoc.payment_splits = input.payment_splits;
    }
    if (input.discount && input.discount.value > 0) {
      saleDoc.discount_type = input.discount.type;
      saleDoc.discount_value = input.discount.value;
    }

    transaction.set(saleRef, saleDoc);

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
        discount_amount: discountAmount,
        payment_method: paymentMethod,
        item_count: itemCount,
      },
    });

    const receipt: ReceiptData = {
      sale_id: saleRef.id,
      sale_date: new Date(),
      cashier_name: actor.name,
      lines: saleLines.map(
        (line): ReceiptLine => ({
          product_name: line.item.product_name_snapshot,
          batch_number: line.batch.batch_number,
          quantity: line.quantity,
          unit_price: line.unit_price,
          line_total: line.line_total,
        }),
      ),
      subtotal,
      discount_amount: discountAmount,
      total,
      payment_method: paymentMethod,
      payment_splits: input.payment_splits,
      amount_tendered: amountTendered,
      change,
      item_count: itemCount,
    };

    return { sale_id: saleRef.id, total, change, receipt };
  });
}

export function subscribeRecentRetailSales(
  onData: (sales: SaleTransaction[]) => void,
  onError: () => void,
  limitCount = 10,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(
      collection(db, "saleTransactions"),
      where("channel", "==", "retail"),
      orderBy("sale_date", "desc"),
      limit(limitCount),
    ),
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleTransaction),
      );
    },
    () => onError(),
  );
}

export async function getSaleReceipt(saleId: string): Promise<ReceiptData | null> {
  const db = getFirebaseDb();
  const [saleSnap, itemsSnap] = await Promise.all([
    getDoc(doc(db, "saleTransactions", saleId)),
    getDocs(query(collection(db, "saleLineItems"), where("sale_id", "==", saleId))),
  ]);

  if (!saleSnap.exists()) return null;

  const sale = saleSnap.data() as Omit<SaleTransaction, "id">;
  const saleDate =
    sale.sale_date instanceof Timestamp
      ? sale.sale_date.toDate()
      : (sale.sale_date as Date);

  const lines: ReceiptLine[] = itemsSnap.docs.map((d) => {
    const data = d.data();
    return {
      product_name: data.product_name_snapshot as string,
      batch_number: data.batch_number_snapshot as string,
      quantity: data.quantity as number,
      unit_price: data.unit_price as number,
      line_total: data.line_total as number,
    };
  });

  return {
    sale_id: saleId,
    sale_date: saleDate,
    cashier_name: sale.created_by_name_snapshot,
    lines,
    subtotal: sale.subtotal,
    discount_amount: sale.discount_total ?? 0,
    total: sale.total,
    payment_method: sale.payment_method,
    payment_splits: sale.payment_splits,
    amount_tendered: sale.amount_tendered,
    change: sale.change,
    item_count: sale.item_count,
  };
}

export async function getSaleLineItems(saleId: string): Promise<SaleLineItem[]> {
  const db = getFirebaseDb();
  const snap = await getDocs(
    query(collection(db, "saleLineItems"), where("sale_id", "==", saleId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleLineItem);
}

export async function returnSaleItems(
  originalSaleId: string,
  returnLines: ReturnLine[],
  refundMethod: SinglePaymentMethod,
  notes: string,
  actor: SaleActor,
): Promise<SaleReturn["id"]> {
  if (returnLines.length === 0) {
    throw new Error("Select at least one item to return.");
  }

  const totalRefund = money(
    returnLines.reduce((sum, line) => sum + line.line_total, 0),
  );

  const db = getFirebaseDb();
  const returnRef = doc(collection(db, "saleReturns"));
  const batchRefs = [...new Set(returnLines.map((l) => l.batch_id))].map((id) =>
    doc(db, "batches", id),
  );

  await runTransaction(db, async (transaction) => {
    const batchSnaps = await Promise.all(batchRefs.map((ref) => transaction.get(ref)));
    const batchMap = new Map<string, Batch>();
    for (const snap of batchSnaps) {
      if (snap.exists()) {
        batchMap.set(snap.id, { id: snap.id, ...snap.data() } as Batch);
      }
    }

    const quantityByBatch = new Map<string, number>();
    for (const line of returnLines) {
      quantityByBatch.set(
        line.batch_id,
        (quantityByBatch.get(line.batch_id) ?? 0) + line.quantity_returned,
      );
    }

    for (const [batchId, qty] of quantityByBatch) {
      const batch = batchMap.get(batchId);
      if (!batch || batch.status === "recalled") continue;

      const quantityAfter = batch.quantity_remaining + qty;
      transaction.update(doc(db, "batches", batchId), {
        quantity_remaining: quantityAfter,
        status: "active",
      });

      transaction.set(doc(collection(db, "stockTransactions")), {
        batch_id: batchId,
        product_id: batch.product_id,
        product_name_snapshot: batch.product_name_snapshot,
        batch_number_snapshot: batch.batch_number,
        type: "return",
        quantity_change: qty,
        quantity_after: quantityAfter,
        reason: `Return from sale ${originalSaleId.slice(-8).toUpperCase()}${notes ? ": " + notes : ""}`,
        reference_type: "return",
        reference_id: returnRef.id,
        shop_context: batch.shop_context,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    transaction.set(returnRef, {
      original_sale_id: originalSaleId,
      return_date: serverTimestamp(),
      status: "completed",
      return_lines: returnLines,
      total_refund: totalRefund,
      refund_method: refundMethod,
      notes,
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "SALE_RETURN_PROCESSED",
      entity_type: "saleReturn",
      entity_id: returnRef.id,
      details: {
        original_sale_id: originalSaleId,
        total_refund: totalRefund,
        refund_method: refundMethod,
        item_count: returnLines.reduce((sum, l) => sum + l.quantity_returned, 0),
      },
    });
  });

  return returnRef.id;
}

interface VoidActor {
  uid: string;
  name: string;
  role: string;
}

export async function voidSale(saleId: string, actor: VoidActor): Promise<void> {
  const db = getFirebaseDb();
  const saleRef = doc(db, "saleTransactions", saleId);

  await runTransaction(db, async (transaction) => {
    const saleSnap = await transaction.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Sale not found.");

    const sale = saleSnap.data() as Omit<SaleTransaction, "id">;
    if (sale.status === "voided") throw new Error("This sale is already voided.");

    transaction.update(saleRef, { status: "voided" });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "SALE_VOIDED",
      entity_type: "sale",
      entity_id: saleId,
      details: { total: sale.total, payment_method: sale.payment_method },
    });
  });
}
