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
import type { Supplier } from "@/types";
import type { SupplierInput } from "@/lib/validation/supplier";

interface Actor {
  uid: string;
  name: string;
  role: string;
}

export function subscribeSuppliers(
  onData: (suppliers: Supplier[]) => void,
  onError: (error: Error) => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(collection(db, "suppliers"), orderBy("name")),
    (snapshot) => {
      onData(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Supplier));
    },
    onError,
  );
}

export async function createSupplier(input: SupplierInput, actor: Actor): Promise<string> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const supplierRef = doc(collection(db, "suppliers"));
  const auditRef = doc(collection(db, "auditLogs"));

  batch.set(supplierRef, {
    name: input.name,
    supplier_code: input.supplier_code || null,
    contact_person: input.contact_person || null,
    phone: input.phone || null,
    email: input.email || null,
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
    action: "SUPPLIER_CREATED",
    entity_type: "supplier",
    entity_id: supplierRef.id,
    details: { name: input.name, supplier_code: input.supplier_code || null },
  });

  await batch.commit();
  return supplierRef.id;
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
  actor: Actor,
): Promise<void> {
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  const supplierRef = doc(db, "suppliers", id);
  const auditRef = doc(collection(db, "auditLogs"));

  batch.update(supplierRef, {
    name: input.name,
    supplier_code: input.supplier_code || null,
    contact_person: input.contact_person || null,
    phone: input.phone || null,
    email: input.email || null,
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
    action: "SUPPLIER_UPDATED",
    entity_type: "supplier",
    entity_id: id,
    details: { name: input.name, is_active: input.is_active },
  });

  await batch.commit();
}
