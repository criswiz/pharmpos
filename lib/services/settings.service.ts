import { doc, getDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { PharmacyInfo } from "@/types";

export const defaultPharmacyInfo: PharmacyInfo = {
  name: "Desh Chemists Ltd",
  tagline: "Quality Medicine, Better Life",
  address: "",
  phone: "",
  email: "",
  fda_number: "",
  logo_url: "/desh-logo.jpg",
};

export async function getPharmacyInfo() {
  const db = getFirebaseDb();
  const snapshot = await getDoc(doc(db, "settings", "pharmacyInfo"));
  return snapshot.exists()
    ? ({ ...defaultPharmacyInfo, ...snapshot.data() } as PharmacyInfo)
    : defaultPharmacyInfo;
}
