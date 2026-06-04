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
import type { Product } from "@/types";
import type { ProductInput } from "@/lib/validation/product";

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
