import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

export interface TodayStats {
  total: number;
  saleCount: number;
}

export interface DayRevenue {
  day: string;
  dateKey: string;
  total: number;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfNDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function isoDateKey(date: Date): string {
  // Local YYYY-MM-DD for grouping
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m as number) - 1, d).toLocaleDateString("en-GH", { weekday: "short" });
}

export function subscribeTodayRetailStats(
  onData: (stats: TodayStats) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    query(
      collection(db, "saleTransactions"),
      where("channel", "==", "retail"),
      where("sale_date", ">=", Timestamp.fromDate(startOfToday())),
      orderBy("sale_date", "desc"),
    ),
    (snap) => {
      let total = 0;
      let saleCount = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status === "completed") {
          total += (data.total as number) ?? 0;
          saleCount += 1;
        }
      }
      onData({ total, saleCount });
    },
    () => onError(),
  );
}

export function subscribe7DayRevenue(
  onData: (days: DayRevenue[]) => void,
  onError: () => void,
): () => void {
  const db = getFirebaseDb();
  const since = startOfNDaysAgo(6);

  // Build the skeleton: today going back 6 days
  const skeleton: DayRevenue[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = startOfNDaysAgo(i);
    const key = isoDateKey(d);
    skeleton.push({ day: dayLabel(key), dateKey: key, total: 0 });
  }

  return onSnapshot(
    query(
      collection(db, "saleTransactions"),
      where("sale_date", ">=", Timestamp.fromDate(since)),
      orderBy("sale_date", "asc"),
    ),
    (snap) => {
      const days = skeleton.map((s) => ({ ...s, total: 0 }));
      for (const d of snap.docs) {
        const data = d.data();
        if (data.status !== "completed") continue;
        const saleDate = toDate(data.sale_date);
        const key = isoDateKey(saleDate);
        const idx = days.findIndex((day) => day.dateKey === key);
        if (idx >= 0) {
          days[idx].total += (data.total as number) ?? 0;
        }
      }
      onData(days);
    },
    () => onError(),
  );
}
