import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Customer } from "@/types";
import type { CustomerInput } from "@/lib/validation/customer";

interface Actor {
  uid: string;
  name: string;
  role: string;
}

export function subscribeCustomers(
  onData: (customers: Customer[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, "customers"), orderBy("name")),
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Customer));
    },
    onError,
  );
}

export async function createCustomer(input: CustomerInput, actor: Actor): Promise<string> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const customerRef = doc(collection(db, "customers"));
  const auditRef = doc(collection(db, "auditLogs"));

  batch.set(customerRef, {
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    customer_type: input.customer_type,
    credit_limit: input.credit_limit,
    current_balance: 0,
    address: input.address || null,
    notes: input.notes || null,
    is_active: input.is_active,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    created_by: actor.uid,
  });

  batch.set(auditRef, {
    timestamp: serverTimestamp(),
    user_id: actor.uid,
    user_name_snapshot: actor.name,
    user_role_snapshot: actor.role,
    action: "CUSTOMER_CREATED",
    entity_type: "customer",
    entity_id: customerRef.id,
    details: { name: input.name, customer_type: input.customer_type },
  });

  await batch.commit();
  return customerRef.id;
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
  actor: Actor,
): Promise<void> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const customerRef = doc(db, "customers", id);
  const auditRef = doc(collection(db, "auditLogs"));

  batch.update(customerRef, {
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    customer_type: input.customer_type,
    credit_limit: input.credit_limit,
    address: input.address || null,
    notes: input.notes || null,
    is_active: input.is_active,
    updated_at: serverTimestamp(),
  });

  batch.set(auditRef, {
    timestamp: serverTimestamp(),
    user_id: actor.uid,
    user_name_snapshot: actor.name,
    user_role_snapshot: actor.role,
    action: "CUSTOMER_UPDATED",
    entity_type: "customer",
    entity_id: id,
    details: { name: input.name, is_active: input.is_active },
  });

  await batch.commit();
}
