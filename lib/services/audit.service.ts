import { addDoc, collection, serverTimestamp, writeBatch, doc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

export interface AuditLogInput {
  user_id: string;
  user_name_snapshot: string;
  user_role_snapshot: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
}

export async function writeAuditLog(input: AuditLogInput) {
  const db = getFirebaseDb();
  await addDoc(collection(db, "auditLogs"), {
    ...input,
    timestamp: serverTimestamp(),
  });
}

export function queueAuditLog(batch: ReturnType<typeof writeBatch>, input: AuditLogInput) {
  const db = getFirebaseDb();
  const ref = doc(collection(db, "auditLogs"));
  batch.set(ref, {
    ...input,
    timestamp: serverTimestamp(),
  });
}
