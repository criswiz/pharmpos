import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { PharmacyInfo, PosSettings } from "@/types";

export const defaultPharmacyInfo: PharmacyInfo = {
  name: "Desh Chemists Ltd",
  tagline: "Quality Medicine, Better Life",
  address: "",
  phone: "",
  email: "",
  fda_number: "",
  logo_url: "/desh-logo.jpg",
};

export const defaultPosSettings: PosSettings = {
  discount_threshold_pct: 20,
};

export async function getPharmacyInfo(): Promise<PharmacyInfo> {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, "settings", "pharmacyInfo"));
  return snapshot.exists()
    ? ({ ...defaultPharmacyInfo, ...snapshot.data() } as PharmacyInfo)
    : defaultPharmacyInfo;
}

export async function updatePharmacyInfo(input: PharmacyInfo): Promise<void> {
  const db = getFirebaseDb();
  await setDoc(doc(db, "settings", "pharmacyInfo"), input, { merge: true });
}

export async function getPosSettings(): Promise<PosSettings> {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, "settings", "pos"));
  return snapshot.exists()
    ? ({ ...defaultPosSettings, ...snapshot.data() } as PosSettings)
    : defaultPosSettings;
}

export async function updatePosSettings(input: PosSettings): Promise<void> {
  const db = getFirebaseDb();
  await setDoc(doc(db, "settings", "pos"), input, { merge: true });
}
