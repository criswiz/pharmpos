import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { allocateFefoStock, sellableFefoBatches } from "@/lib/utils/fefo";
import type {
  Batch,
  Product,
  WholesaleDocument,
  WholesaleDocStatus,
  WholesaleLineItem,
  WholesalePaymentMethod,
} from "@/types";
import type { CreateWholesaleDocInput } from "@/lib/validation/wholesale";

interface Actor {
  uid: string;
  name: string;
  role: string;
}

function money(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

async function nextDocNumber(
  db: ReturnType<typeof getFirebaseDb>,
  transaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  prefix: string,
  counterKey: string,
): Promise<string> {
  const counterRef = doc(db, "counters", counterKey);
  const snap = await transaction.get(counterRef);
  const currentYear = new Date().getFullYear();
  const existing = snap.exists() ? snap.data() : null;
  const seq = existing?.year === currentYear ? (existing.sequence as number) + 1 : 1;
  transaction.set(counterRef, { year: currentYear, sequence: seq });
  return `${prefix}-${currentYear}-${String(seq).padStart(3, "0")}`;
}

export function subscribeWholesaleDocs(
  onData: (docs: WholesaleDocument[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, "documents"), orderBy("created_at", "desc")),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WholesaleDocument));
    },
    () => onError(),
  );
}

export async function createWholesaleDoc(
  input: CreateWholesaleDocInput,
  products: Product[],
  batches: Batch[],
  actor: Actor,
): Promise<{ docId: string; docNumber: string }> {
  const db = getFirebaseDb();
  const docRef = doc(collection(db, "documents"));

  return runTransaction(db, async (transaction) => {
    const prefix = input.type === "proforma" ? "PRF" : "INV";
    const counterKey = input.type === "proforma" ? "proforma" : "invoice";
    const docNumber = await nextDocNumber(db, transaction, prefix, counterKey);

    const rawSubtotal = input.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const subtotal = money(rawSubtotal);
    const discountAmount = money(Math.min(input.discount_amount ?? 0, subtotal));
    const total = money(subtotal - discountAmount);

    let allocatedLines: WholesaleLineItem[] = input.lines.map((l) => ({
      product_id: l.product_id,
      product_name_snapshot: l.product_name_snapshot,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: money(l.quantity * l.unit_price),
    }));

    if (input.type === "invoice") {
      // Re-read candidate batches inside transaction for accurate stock
      const productIds = new Set(input.lines.map((l) => l.product_id));
      const candidates = sellableFefoBatches(batches, ["wholesale", "shared"]).filter((b) =>
        productIds.has(b.product_id),
      );
      const candidateSnaps = await Promise.all(
        candidates.map((b) => transaction.get(doc(db, "batches", b.id))),
      );
      const currentBatches = candidateSnaps
        .filter((s) => s.exists())
        .map((s) => ({ id: s.id, ...s.data() }) as Batch);

      // FEFO allocate per line
      const finalLines: WholesaleLineItem[] = [];
      for (const line of input.lines) {
        const allocation = allocateFefoStock(
          currentBatches.filter((b) => b.product_id === line.product_id),
          line.quantity,
          ["wholesale", "shared"],
        );
        if (!allocation.fulfilled) {
          const name =
            products.find((p) => p.id === line.product_id)?.name_brand ?? line.product_name_snapshot;
          throw new Error(
            `${name} has only ${allocation.available} units in wholesale stock.`,
          );
        }
        for (const allocated of allocation.allocations) {
          finalLines.push({
            product_id: line.product_id,
            product_name_snapshot: line.product_name_snapshot,
            batch_id: allocated.batch.id,
            batch_number_snapshot: allocated.batch.batch_number,
            quantity: allocated.quantity,
            unit_price: line.unit_price,
            line_total: money(allocated.quantity * line.unit_price),
          });
        }
      }
      allocatedLines = finalLines;

      const saleRef = doc(collection(db, "saleTransactions"));
      const itemCount = input.lines.reduce((s, l) => s + l.quantity, 0);
      const amountPaid = input.payment_method !== "credit" ? total : 0;

      transaction.set(saleRef, {
        sale_date: serverTimestamp(),
        channel: "wholesale",
        status: "completed",
        subtotal,
        discount_total: discountAmount,
        total,
        payment_method: input.payment_method ?? "credit",
        amount_tendered: amountPaid,
        change: 0,
        item_count: itemCount,
        line_count: finalLines.length,
        customer_id: input.customer_id,
        customer_name_snapshot: input.customer_name_snapshot,
        document_id: docRef.id,
        created_by: actor.uid,
        created_by_name_snapshot: actor.name,
      });

      // Deduct batches
      const qtyByBatch = new Map<string, number>();
      for (const l of finalLines) {
        if (l.batch_id) {
          qtyByBatch.set(l.batch_id, (qtyByBatch.get(l.batch_id) ?? 0) + l.quantity);
        }
      }

      for (const [batchId, qty] of qtyByBatch) {
        const currentBatch = currentBatches.find((b) => b.id === batchId)!;
        const qtyAfter = currentBatch.quantity_remaining - qty;
        transaction.update(doc(db, "batches", batchId), {
          quantity_remaining: qtyAfter,
          status: qtyAfter === 0 ? "depleted" : "active",
          last_sale_id: saleRef.id,
        });
        transaction.set(doc(collection(db, "stockTransactions")), {
          batch_id: batchId,
          product_id: currentBatch.product_id,
          product_name_snapshot: currentBatch.product_name_snapshot,
          batch_number_snapshot: currentBatch.batch_number,
          type: "sale",
          quantity_change: -qty,
          quantity_after: qtyAfter,
          reason: `Wholesale invoice ${docNumber}`,
          reference_type: "wholesale_sale",
          reference_id: saleRef.id,
          shop_context: currentBatch.shop_context,
          created_at: serverTimestamp(),
          created_by: actor.uid,
        });
      }

      for (const line of finalLines) {
        const costPrice =
          currentBatches.find((b) => b.id === line.batch_id)?.cost_price ?? 0;
        transaction.set(doc(collection(db, "saleLineItems")), {
          sale_id: saleRef.id,
          product_id: line.product_id,
          product_name_snapshot: line.product_name_snapshot,
          batch_id: line.batch_id!,
          batch_number_snapshot: line.batch_number_snapshot!,
          quantity: line.quantity,
          unit_price: line.unit_price,
          cost_price_snapshot: costPrice,
          line_total: line.line_total,
          created_at: serverTimestamp(),
          created_by: actor.uid,
        });
      }

      if (input.payment_method === "credit") {
        transaction.update(doc(db, "customers", input.customer_id), {
          current_balance: increment(total),
        });
      }
    }

    const status: WholesaleDocStatus =
      input.type === "proforma"
        ? "draft"
        : input.payment_method !== "credit"
          ? "paid"
          : "confirmed";

    transaction.set(docRef, {
      type: input.type,
      doc_number: docNumber,
      customer_id: input.customer_id,
      customer_name_snapshot: input.customer_name_snapshot,
      customer_phone_snapshot: input.customer_phone_snapshot || null,
      customer_address_snapshot: input.customer_address_snapshot || null,
      line_items: allocatedLines,
      subtotal,
      discount_amount: discountAmount,
      total,
      payment_method: input.payment_method || null,
      amount_paid:
        input.type === "invoice" && input.payment_method !== "credit" ? total : 0,
      notes: input.notes || null,
      status,
      created_at: serverTimestamp(),
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action:
        input.type === "proforma" ? "PROFORMA_CREATED" : "WHOLESALE_INVOICE_CREATED",
      entity_type: "document",
      entity_id: docRef.id,
      details: {
        doc_number: docNumber,
        customer: input.customer_name_snapshot,
        total,
        payment_method: input.payment_method ?? null,
      },
    });

    return { docId: docRef.id, docNumber };
  });
}

export async function convertToInvoice(
  proformaId: string,
  paymentMethod: WholesalePaymentMethod,
  batches: Batch[],
  actor: Actor,
): Promise<{ invoiceNumber: string }> {
  const db = getFirebaseDb();
  const proformaRef = doc(db, "documents", proformaId);

  return runTransaction(db, async (transaction) => {
    const proformaSnap = await transaction.get(proformaRef);
    if (!proformaSnap.exists()) throw new Error("Proforma not found.");

    const proforma = { id: proformaSnap.id, ...proformaSnap.data() } as WholesaleDocument;
    if (proforma.type !== "proforma" || proforma.status !== "draft") {
      throw new Error("Only a draft proforma can be converted to an invoice.");
    }

    const invoiceNumber = await nextDocNumber(db, transaction, "INV", "invoice");

    // FEFO allocate
    const productIds = new Set(proforma.line_items.map((l) => l.product_id));
    const candidates = sellableFefoBatches(batches, ["wholesale", "shared"]).filter((b) =>
      productIds.has(b.product_id),
    );
    const candidateSnaps = await Promise.all(
      candidates.map((b) => transaction.get(doc(db, "batches", b.id))),
    );
    const currentBatches = candidateSnaps
      .filter((s) => s.exists())
      .map((s) => ({ id: s.id, ...s.data() }) as Batch);

    const finalLines: WholesaleLineItem[] = [];
    for (const line of proforma.line_items) {
      const allocation = allocateFefoStock(
        currentBatches.filter((b) => b.product_id === line.product_id),
        line.quantity,
        ["wholesale", "shared"],
      );
      if (!allocation.fulfilled) {
        throw new Error(
          `${line.product_name_snapshot} has only ${allocation.available} units available.`,
        );
      }
      for (const allocated of allocation.allocations) {
        finalLines.push({
          product_id: line.product_id,
          product_name_snapshot: line.product_name_snapshot,
          batch_id: allocated.batch.id,
          batch_number_snapshot: allocated.batch.batch_number,
          quantity: allocated.quantity,
          unit_price: line.unit_price,
          line_total: money(allocated.quantity * line.unit_price),
        });
      }
    }

    const saleRef = doc(collection(db, "saleTransactions"));
    const itemCount = finalLines.reduce((s, l) => s + l.quantity, 0);
    const amountPaid = paymentMethod !== "credit" ? proforma.total : 0;

    transaction.set(saleRef, {
      sale_date: serverTimestamp(),
      channel: "wholesale",
      status: "completed",
      subtotal: proforma.subtotal,
      discount_total: proforma.discount_amount,
      total: proforma.total,
      payment_method: paymentMethod,
      amount_tendered: amountPaid,
      change: 0,
      item_count: itemCount,
      line_count: finalLines.length,
      customer_id: proforma.customer_id,
      customer_name_snapshot: proforma.customer_name_snapshot,
      document_id: proformaId,
      created_by: actor.uid,
      created_by_name_snapshot: actor.name,
    });

    const qtyByBatch = new Map<string, number>();
    for (const l of finalLines) {
      if (l.batch_id) {
        qtyByBatch.set(l.batch_id, (qtyByBatch.get(l.batch_id) ?? 0) + l.quantity);
      }
    }

    for (const [batchId, qty] of qtyByBatch) {
      const currentBatch = currentBatches.find((b) => b.id === batchId)!;
      const qtyAfter = currentBatch.quantity_remaining - qty;
      transaction.update(doc(db, "batches", batchId), {
        quantity_remaining: qtyAfter,
        status: qtyAfter === 0 ? "depleted" : "active",
        last_sale_id: saleRef.id,
      });
      transaction.set(doc(collection(db, "stockTransactions")), {
        batch_id: batchId,
        product_id: currentBatch.product_id,
        product_name_snapshot: currentBatch.product_name_snapshot,
        batch_number_snapshot: currentBatch.batch_number,
        type: "sale",
        quantity_change: -qty,
        quantity_after: qtyAfter,
        reason: `Wholesale invoice ${invoiceNumber} (from ${proforma.doc_number})`,
        reference_type: "wholesale_sale",
        reference_id: saleRef.id,
        shop_context: currentBatch.shop_context,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    for (const line of finalLines) {
      const costPrice = currentBatches.find((b) => b.id === line.batch_id)?.cost_price ?? 0;
      transaction.set(doc(collection(db, "saleLineItems")), {
        sale_id: saleRef.id,
        product_id: line.product_id,
        product_name_snapshot: line.product_name_snapshot,
        batch_id: line.batch_id!,
        batch_number_snapshot: line.batch_number_snapshot!,
        quantity: line.quantity,
        unit_price: line.unit_price,
        cost_price_snapshot: costPrice,
        line_total: line.line_total,
        created_at: serverTimestamp(),
        created_by: actor.uid,
      });
    }

    if (paymentMethod === "credit") {
      transaction.update(doc(db, "customers", proforma.customer_id), {
        current_balance: increment(proforma.total),
      });
    }

    const newStatus: WholesaleDocStatus = paymentMethod !== "credit" ? "paid" : "confirmed";
    transaction.update(proformaRef, {
      type: "invoice",
      doc_number: invoiceNumber,
      payment_method: paymentMethod,
      amount_paid: paymentMethod !== "credit" ? proforma.total : 0,
      line_items: finalLines,
      status: newStatus,
      proforma_id: proformaId,
      updated_at: serverTimestamp(),
    });

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "PROFORMA_CONVERTED_TO_INVOICE",
      entity_type: "document",
      entity_id: proformaId,
      details: {
        invoice_number: invoiceNumber,
        customer: proforma.customer_name_snapshot,
        total: proforma.total,
        payment_method: paymentMethod,
      },
    });

    return { invoiceNumber };
  });
}

export async function recordPayment(
  docId: string,
  amount: number,
  actor: Actor,
): Promise<void> {
  const db = getFirebaseDb();
  const docRef = doc(db, "documents", docId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists()) throw new Error("Document not found.");

    const wholesale = { id: snap.id, ...snap.data() } as WholesaleDocument;
    if (wholesale.type !== "invoice") throw new Error("Can only record payment against an invoice.");
    if (wholesale.status === "paid") throw new Error("This invoice is already fully paid.");
    if (wholesale.status === "void") throw new Error("Cannot record payment against a voided document.");

    const newAmountPaid = money(wholesale.amount_paid + amount);
    const balance = money(wholesale.total - newAmountPaid);
    const newStatus: WholesaleDocStatus = balance <= 0 ? "paid" : "partially_paid";

    transaction.update(docRef, {
      amount_paid: newAmountPaid,
      status: newStatus,
      updated_at: serverTimestamp(),
    });

    if (wholesale.payment_method === "credit") {
      transaction.update(doc(db, "customers", wholesale.customer_id), {
        current_balance: increment(-amount),
      });
    }

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "WHOLESALE_PAYMENT_RECORDED",
      entity_type: "document",
      entity_id: docId,
      details: {
        doc_number: wholesale.doc_number,
        amount,
        new_status: newStatus,
      },
    });
  });
}

export async function voidWholesaleDoc(docId: string, actor: Actor): Promise<void> {
  const db = getFirebaseDb();
  const docRef = doc(db, "documents", docId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists()) throw new Error("Document not found.");

    const wholesale = snap.data() as Omit<WholesaleDocument, "id">;
    if (wholesale.status === "void") throw new Error("Already voided.");

    transaction.update(docRef, { status: "void", updated_at: serverTimestamp() });

    // If it was a credit invoice with unpaid balance, reduce customer balance
    if (
      wholesale.type === "invoice" &&
      wholesale.payment_method === "credit" &&
      wholesale.amount_paid < wholesale.total
    ) {
      const unpaid = money(wholesale.total - wholesale.amount_paid);
      transaction.update(doc(db, "customers", wholesale.customer_id), {
        current_balance: increment(-unpaid),
      });
    }

    transaction.set(doc(collection(db, "auditLogs")), {
      timestamp: serverTimestamp(),
      user_id: actor.uid,
      user_name_snapshot: actor.name,
      user_role_snapshot: actor.role,
      action: "WHOLESALE_DOCUMENT_VOIDED",
      entity_type: "document",
      entity_id: docId,
      details: { doc_number: wholesale.doc_number },
    });
  });
}
