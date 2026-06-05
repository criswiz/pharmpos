"use client";

import {
  BarChart3,
  BoxesIcon,
  CalendarClock,
  ClipboardList,
  Download,
  FileText,
  Loader2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Timestamp, collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { getFirebaseDb } from "@/lib/firebase/client";
import { subscribeBatches, subscribeProducts } from "@/lib/services/inventory.service";
import { subscribeGrns } from "@/lib/services/purchasing.service";
import { getPharmacyInfo } from "@/lib/services/settings.service";
import { downloadCsv, openPrintReport } from "@/lib/utils/export";
import type { Batch, FirestoreDate, GoodsReceivedNote, Product, SaleTransaction } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");
const dateFormat = new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric" });

type Tab = "sales" | "stock" | "expiry" | "grn";

function toDate(v: FirestoreDate | undefined): Date {
  if (!v) return new Date();
  return typeof (v as { toDate?: () => Date }).toDate === "function"
    ? (v as { toDate: () => Date }).toDate()
    : (v as Date);
}

function isoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayIso(): string { return isoKey(new Date()); }

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function stockState(batch: Batch, now: Date) {
  if (batch.status !== "active") return batch.status;
  if (batch.quantity_remaining <= 0) return "depleted";
  const days = Math.ceil((toDate(batch.expiry_date).getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "expired";
  return days <= 30 ? "expiring" : "active";
}

// ─── Sales Tab ────────────────────────────────────────────────────────────────

interface DailySale {
  date: string;
  transactions: number;
  total: number;
  discount_total: number;
  cash: number;
  momo: number;
  card: number;
  split: number;
}

function SalesReport() {
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<SaleTransaction[] | null>(null);
  const [pharmacyName, setPharmacyName] = useState("PharmPOS");

  useEffect(() => {
    getPharmacyInfo().then((p) => setPharmacyName(p.name)).catch(() => undefined);
  }, []);

  async function handleGenerate() {
    if (!from || !to) return;
    setLoading(true);
    try {
      const db = getFirebaseDb();
      const snap = await getDocs(
        query(
          collection(db, "saleTransactions"),
          where("channel", "==", "retail"),
          where("sale_date", ">=", Timestamp.fromDate(new Date(`${from}T00:00:00`))),
          where("sale_date", "<=", Timestamp.fromDate(new Date(`${to}T23:59:59`))),
          orderBy("sale_date", "asc"),
        ),
      );
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SaleTransaction));
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }

  const { daily, totals } = useMemo(() => {
    if (!sales) return { daily: [], totals: null };
    const map = new Map<string, DailySale>();
    for (const s of sales) {
      if (s.status === "voided") continue;
      const key = isoKey(toDate(s.sale_date));
      const existing = map.get(key) ?? { date: key, transactions: 0, total: 0, discount_total: 0, cash: 0, momo: 0, card: 0, split: 0 };
      existing.transactions += 1;
      existing.total += s.total;
      existing.discount_total += s.discount_total ?? 0;
      if (s.payment_method === "cash") existing.cash += s.total;
      else if (s.payment_method === "momo") existing.momo += s.total;
      else if (s.payment_method === "card") existing.card += s.total;
      else if (s.payment_method === "split") existing.split += s.total;
      map.set(key, existing);
    }
    const daily = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    const totals = daily.reduce(
      (acc, d) => ({
        transactions: acc.transactions + d.transactions,
        total: acc.total + d.total,
        discount_total: acc.discount_total + d.discount_total,
        cash: acc.cash + d.cash,
        momo: acc.momo + d.momo,
        card: acc.card + d.card,
        split: acc.split + d.split,
      }),
      { transactions: 0, total: 0, discount_total: 0, cash: 0, momo: 0, card: 0, split: 0 },
    );
    return { daily, totals };
  }, [sales]);

  function handleCsvExport() {
    if (!daily.length) return;
    downloadCsv(
      daily.map((d) => ({
        Date: d.date,
        Transactions: d.transactions,
        "Total (GHS)": d.total.toFixed(2),
        "Cash (GHS)": d.cash.toFixed(2),
        "MoMo (GHS)": d.momo.toFixed(2),
        "Card (GHS)": d.card.toFixed(2),
        "Split (GHS)": d.split.toFixed(2),
        "Discounts (GHS)": d.discount_total.toFixed(2),
      })),
      `sales-report-${from}-${to}`,
    );
  }

  function handlePdfExport() {
    if (!daily.length || !totals) return;
    const rows: (string | number)[][] = [
      ...daily.map((d) => [
        d.date,
        d.transactions,
        currency.format(d.total),
        currency.format(d.cash),
        currency.format(d.momo),
        currency.format(d.card),
        currency.format(d.split),
        currency.format(d.discount_total),
      ]),
      ["TOTAL", totals.transactions, currency.format(totals.total), currency.format(totals.cash), currency.format(totals.momo), currency.format(totals.card), currency.format(totals.split), currency.format(totals.discount_total)],
    ];
    openPrintReport(
      "Sales Report",
      `${pharmacyName} · Retail · ${from} to ${to}`,
      ["Date", "Txns", "Total", "Cash", "MoMo", "Card", "Split", "Discounts"],
      rows,
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-emerald-950">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" />
        </label>
        <label className="text-sm font-medium text-emerald-950">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={handleGenerate}
          className="flex h-9 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Generate
        </button>
        {sales && sales.length > 0 ? (
          <>
            <button type="button" onClick={handleCsvExport} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <Download className="h-4 w-4" />CSV
            </button>
            <button type="button" onClick={handlePdfExport} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <FileText className="h-4 w-4" />PDF
            </button>
          </>
        ) : null}
      </div>

      {sales !== null && totals && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            {[
              { label: "Total revenue", value: currency.format(totals.total) },
              { label: "Transactions", value: number.format(totals.transactions) },
              { label: "Avg sale", value: totals.transactions > 0 ? currency.format(totals.total / totals.transactions) : "—" },
              { label: "Total discounts", value: currency.format(totals.discount_total) },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase text-zinc-500">{s.label}</p>
                <p className="mt-2 text-xl font-semibold text-emerald-950">{s.value}</p>
              </div>
            ))}
          </div>

          {daily.length === 0 ? (
            <p className="rounded-md border border-zinc-100 bg-white px-4 py-8 text-center text-sm text-zinc-500 shadow-sm">
              No completed retail sales found for this date range.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                  <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Txns</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Cash</th>
                      <th className="px-4 py-3 font-semibold">MoMo</th>
                      <th className="px-4 py-3 font-semibold">Card</th>
                      <th className="px-4 py-3 font-semibold">Split</th>
                      <th className="px-4 py-3 font-semibold">Discounts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {daily.map((d) => (
                      <tr key={d.date} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 text-zinc-700">{d.date}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.transactions}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-950">{currency.format(d.total)}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.cash > 0 ? currency.format(d.cash) : "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.momo > 0 ? currency.format(d.momo) : "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.card > 0 ? currency.format(d.card) : "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.split > 0 ? currency.format(d.split) : "—"}</td>
                        <td className="px-4 py-3 text-zinc-700">{d.discount_total > 0 ? currency.format(d.discount_total) : "—"}</td>
                      </tr>
                    ))}
                    <tr className="bg-emerald-50 font-semibold">
                      <td className="px-4 py-3 text-emerald-950">TOTAL</td>
                      <td className="px-4 py-3 text-emerald-950">{totals.transactions}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.total)}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.cash)}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.momo)}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.card)}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.split)}</td>
                      <td className="px-4 py-3 text-emerald-950">{currency.format(totals.discount_total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Stock Valuation Tab ──────────────────────────────────────────────────────

interface StockRow {
  product: Product;
  batches: Batch[];
  totalUnits: number;
  costValue: number;
  retailValue: number;
  lowestExpiry: Date | null;
}

function StockValuationReport({
  products,
  batches,
  loading,
}: {
  products: Product[];
  batches: Batch[];
  loading: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const [pharmacyName, setPharmacyName] = useState("PharmPOS");

  useEffect(() => {
    getPharmacyInfo().then((p) => setPharmacyName(p.name)).catch(() => undefined);
  }, []);

  const rows = useMemo((): StockRow[] => {
    const batchesByProduct = new Map<string, Batch[]>();
    for (const b of batches) {
      const state = stockState(b, now);
      if (state !== "active" && state !== "expiring") continue;
      const arr = batchesByProduct.get(b.product_id) ?? [];
      arr.push(b);
      batchesByProduct.set(b.product_id, arr);
    }
    return products
      .filter((p) => p.is_active && batchesByProduct.has(p.id))
      .map((p) => {
        const pBatches = batchesByProduct.get(p.id) ?? [];
        const totalUnits = pBatches.reduce((s, b) => s + b.quantity_remaining, 0);
        const costValue = pBatches.reduce((s, b) => s + b.quantity_remaining * b.cost_price, 0);
        const retailValue = pBatches.reduce((s, b) => s + b.quantity_remaining * b.retail_price, 0);
        const expiryDates = pBatches.map((b) => toDate(b.expiry_date)).sort((a, b) => a.getTime() - b.getTime());
        return { product: p, batches: pBatches, totalUnits, costValue, retailValue, lowestExpiry: expiryDates[0] ?? null };
      })
      .sort((a, b) => a.product.name_generic.localeCompare(b.product.name_generic));
  }, [products, batches, now]);

  const totals = useMemo(() => ({
    units: rows.reduce((s, r) => s + r.totalUnits, 0),
    costValue: rows.reduce((s, r) => s + r.costValue, 0),
    retailValue: rows.reduce((s, r) => s + r.retailValue, 0),
  }), [rows]);

  function handleCsvExport() {
    downloadCsv(
      rows.map((r) => ({
        "Product (Brand)": r.product.name_brand,
        "Generic Name": r.product.name_generic,
        Category: r.product.category,
        "Active Batches": r.batches.length,
        "Units Remaining": r.totalUnits,
        "Cost Value (GHS)": r.costValue.toFixed(2),
        "Retail Value (GHS)": r.retailValue.toFixed(2),
        "Earliest Expiry": r.lowestExpiry ? dateFormat.format(r.lowestExpiry) : "—",
      })),
      `stock-valuation-${isoKey(now)}`,
    );
  }

  function handlePdfExport() {
    openPrintReport(
      "Stock Valuation Report",
      `${pharmacyName} · As at ${dateFormat.format(now)}`,
      ["Product", "Generic", "Batches", "Units", "Cost Value", "Retail Value", "Earliest Expiry"],
      [
        ...rows.map((r) => [
          r.product.name_brand,
          r.product.name_generic,
          r.batches.length,
          number.format(r.totalUnits),
          currency.format(r.costValue),
          currency.format(r.retailValue),
          r.lowestExpiry ? dateFormat.format(r.lowestExpiry) : "—",
        ]),
        ["TOTAL", "", "", number.format(totals.units), currency.format(totals.costValue), currency.format(totals.retailValue), ""],
      ],
    );
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="rounded-md border border-emerald-900/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase text-zinc-500">Active SKUs</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{rows.length}</p>
          </div>
          <div className="rounded-md border border-emerald-900/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase text-zinc-500">Total units</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{number.format(totals.units)}</p>
          </div>
          <div className="rounded-md border border-emerald-900/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase text-zinc-500">Cost value</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{currency.format(totals.costValue)}</p>
          </div>
          <div className="rounded-md border border-emerald-900/10 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase text-zinc-500">Retail value</p>
            <p className="mt-1 text-xl font-semibold text-emerald-950">{currency.format(totals.retailValue)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleCsvExport} disabled={rows.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
            <Download className="h-4 w-4" />CSV
          </button>
          <button type="button" onClick={handlePdfExport} disabled={rows.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
            <FileText className="h-4 w-4" />PDF
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Batches</th>
                <th className="px-4 py-3 font-semibold">Units</th>
                <th className="px-4 py-3 font-semibold">Cost value</th>
                <th className="px-4 py-3 font-semibold">Retail value</th>
                <th className="px-4 py-3 font-semibold">Earliest expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.product.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-emerald-950">{r.product.name_brand}</p>
                    <p className="text-xs text-zinc-500">{r.product.name_generic}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{r.product.category}</td>
                  <td className="px-4 py-3 text-zinc-700">{r.batches.length}</td>
                  <td className="px-4 py-3 text-zinc-700">{number.format(r.totalUnits)}</td>
                  <td className="px-4 py-3 text-zinc-700">{currency.format(r.costValue)}</td>
                  <td className="px-4 py-3 font-medium text-emerald-800">{currency.format(r.retailValue)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{r.lowestExpiry ? dateFormat.format(r.lowestExpiry) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No active stock found.</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Expiry Report Tab ────────────────────────────────────────────────────────

function ExpiryReport({
  batches,
  loading,
}: {
  batches: Batch[];
  loading: boolean;
}) {
  const [threshold, setThreshold] = useState(30);
  const now = useMemo(() => new Date(), []);
  const [pharmacyName, setPharmacyName] = useState("PharmPOS");

  useEffect(() => {
    getPharmacyInfo().then((p) => setPharmacyName(p.name)).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    return batches
      .filter((b) => {
        if (b.status === "recalled" || b.status === "depleted") return false;
        const days = Math.ceil((toDate(b.expiry_date).getTime() - now.getTime()) / 86_400_000);
        return days <= threshold;
      })
      .map((b) => ({ ...b, daysLeft: Math.ceil((toDate(b.expiry_date).getTime() - now.getTime()) / 86_400_000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [batches, threshold, now]);

  function handleCsvExport() {
    downloadCsv(
      filtered.map((b) => ({
        Product: b.product_name_snapshot,
        "Batch Number": b.batch_number,
        "Expiry Date": dateFormat.format(toDate(b.expiry_date)),
        "Days Left": b.daysLeft <= 0 ? "EXPIRED" : b.daysLeft,
        "Qty Remaining": b.quantity_remaining,
        "Retail Price (GHS)": b.retail_price.toFixed(2),
        "Retail Value (GHS)": (b.quantity_remaining * b.retail_price).toFixed(2),
        Pool: b.shop_context,
        Status: b.daysLeft <= 0 ? "Expired" : "Expiring soon",
      })),
      `expiry-report-${threshold}days-${isoKey(now)}`,
    );
  }

  function handlePdfExport() {
    openPrintReport(
      "Expiry Report",
      `${pharmacyName} · Batches expiring within ${threshold} days · ${dateFormat.format(now)}`,
      ["Product", "Batch #", "Expiry", "Days Left", "Qty", "Retail Value"],
      filtered.map((b) => [
        b.product_name_snapshot,
        b.batch_number,
        dateFormat.format(toDate(b.expiry_date)),
        b.daysLeft <= 0 ? "EXPIRED" : b.daysLeft,
        number.format(b.quantity_remaining),
        currency.format(b.quantity_remaining * b.retail_price),
      ]),
    );
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-emerald-950">
          Show batches expiring within
          <select
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="ml-2 h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700"
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={0}>Expired only</option>
          </select>
        </label>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {filtered.length} batch{filtered.length === 1 ? "" : "es"}
        </span>
        <button type="button" onClick={handleCsvExport} disabled={filtered.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          <Download className="h-4 w-4" />CSV
        </button>
        <button type="button" onClick={handlePdfExport} disabled={filtered.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          <FileText className="h-4 w-4" />PDF
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Batch #</th>
                <th className="px-4 py-3 font-semibold">Expiry date</th>
                <th className="px-4 py-3 font-semibold">Days left</th>
                <th className="px-4 py-3 font-semibold">Qty remaining</th>
                <th className="px-4 py-3 font-semibold">Retail value</th>
                <th className="px-4 py-3 font-semibold">Pool</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-emerald-950">{b.product_name_snapshot}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">{b.batch_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{dateFormat.format(toDate(b.expiry_date))}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${b.daysLeft <= 0 ? "text-red-600" : b.daysLeft <= 7 ? "text-red-500" : "text-amber-600"}`}>
                      {b.daysLeft <= 0 ? "Expired" : `${b.daysLeft}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{number.format(b.quantity_remaining)}</td>
                  <td className="px-4 py-3 text-zinc-700">{currency.format(b.quantity_remaining * b.retail_price)}</td>
                  <td className="px-4 py-3 capitalize text-zinc-500">{b.shop_context}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No batches match this threshold.</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── GRN History Tab ──────────────────────────────────────────────────────────

function GrnHistoryReport({
  grns,
  loading,
}: {
  grns: GoodsReceivedNote[];
  loading: boolean;
}) {
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [pharmacyName, setPharmacyName] = useState("PharmPOS");

  useEffect(() => {
    getPharmacyInfo().then((p) => setPharmacyName(p.name)).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T23:59:59`).getTime();
    return grns.filter((g) => {
      const t = toDate(g.received_date).getTime();
      return t >= start && t <= end;
    });
  }, [grns, from, to]);

  const totalCost = filtered.reduce((s, g) => s + g.total_value, 0);

  function handleCsvExport() {
    downloadCsv(
      filtered.map((g) => ({
        "GRN Number": g.grn_number,
        "Date Received": dateFormat.format(toDate(g.received_date)),
        Supplier: g.supplier_name_snapshot || "—",
        "PO Reference": g.po_number_snapshot || "—",
        "Line Items": g.lines.length,
        "Total Cost (GHS)": g.total_value.toFixed(2),
      })),
      `grn-history-${from}-${to}`,
    );
  }

  function handlePdfExport() {
    openPrintReport(
      "GRN History",
      `${pharmacyName} · ${from} to ${to}`,
      ["GRN #", "Date", "Supplier", "PO Ref", "Lines", "Total Cost"],
      [
        ...filtered.map((g) => [
          g.grn_number,
          dateFormat.format(toDate(g.received_date)),
          g.supplier_name_snapshot || "—",
          g.po_number_snapshot || "—",
          g.lines.length,
          currency.format(g.total_value),
        ]),
        ["TOTAL", "", "", "", filtered.reduce((s, g) => s + g.lines.length, 0), currency.format(totalCost)],
      ],
    );
  }

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium text-emerald-950">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" />
        </label>
        <label className="text-sm font-medium text-emerald-950">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700" />
        </label>
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {filtered.length} GRN{filtered.length === 1 ? "" : "s"} · {currency.format(totalCost)}
        </span>
        <button type="button" onClick={handleCsvExport} disabled={filtered.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          <Download className="h-4 w-4" />CSV
        </button>
        <button type="button" onClick={handlePdfExport} disabled={filtered.length === 0} className="flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          <FileText className="h-4 w-4" />PDF
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">GRN #</th>
                <th className="px-4 py-3 font-semibold">Date received</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">PO ref</th>
                <th className="px-4 py-3 font-semibold">Lines</th>
                <th className="px-4 py-3 font-semibold">Total cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((g) => (
                <tr key={g.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono font-semibold text-emerald-950">{g.grn_number}</td>
                  <td className="px-4 py-3 text-zinc-700">{dateFormat.format(toDate(g.received_date))}</td>
                  <td className="px-4 py-3 text-zinc-700">{g.supplier_name_snapshot || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{g.po_number_snapshot || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{g.lines.length}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-950">{currency.format(g.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">No GRNs found for this date range.</p>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "sales", label: "Sales", icon: BarChart3 },
  { id: "stock", label: "Stock valuation", icon: BoxesIcon },
  { id: "expiry", label: "Expiry", icon: CalendarClock },
  { id: "grn", label: "GRN history", icon: ClipboardList },
];

export function ReportsView() {
  const [tab, setTab] = useState<Tab>("sales");
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [grns, setGrns] = useState<GoodsReceivedNote[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [grnsLoading, setGrnsLoading] = useState(true);

  useEffect(() => {
    let pending = 2;
    const done = () => { if (--pending === 0) setInventoryLoading(false); };
    const unsubscribes: Array<() => void> = [];
    try {
      unsubscribes.push(
        subscribeProducts((p) => { setProducts(p); done(); }, () => done()),
        subscribeBatches((b) => { setBatches(b); done(); }, () => done()),
      );
    } catch {
      setTimeout(() => setInventoryLoading(false), 0);
    }
    return () => unsubscribes.forEach((u) => u());
  }, []);

  useEffect(() => {
    try {
      return subscribeGrns(
        (g) => { setGrns(g); setGrnsLoading(false); },
        () => setGrnsLoading(false),
      );
    } catch {
      setTimeout(() => setGrnsLoading(false), 0);
    }
  }, []);

  return (
    <div className="space-y-5">
      <header className="border-b border-emerald-900/10 pb-5">
        <p className="text-xs font-semibold uppercase text-lime-700">Analytics</p>
        <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Reports</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Generate sales, inventory, and procurement reports. Export to CSV or print as PDF.
        </p>
      </header>

      <nav className="flex gap-2 overflow-x-auto border-b border-emerald-900/10 pb-3">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-emerald-700 text-white"
                : "text-emerald-950 hover:bg-emerald-50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "sales" && <SalesReport />}
      {tab === "stock" && <StockValuationReport products={products} batches={batches} loading={inventoryLoading} />}
      {tab === "expiry" && <ExpiryReport batches={batches} loading={inventoryLoading} />}
      {tab === "grn" && <GrnHistoryReport grns={grns} loading={grnsLoading} />}
    </div>
  );
}
