"use client";

import {
  AlertOctagon,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  PackageSearch,
  PackagePlus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { subscribeBatches, subscribeBatchMovements, subscribeProducts } from "@/lib/services/inventory.service";
import type { AdjustmentType, Batch, FirestoreDate, Product, StockTransaction } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");

const dateFormat = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const tsFormat = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: FirestoreDate | undefined): Date {
  if (!value) return new Date();
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

function stockState(batch: Batch) {
  if (batch.status !== "active") return batch.status;
  if (batch.quantity_remaining <= 0) return "depleted";
  const days = Math.ceil((toDate(batch.expiry_date).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  return days <= 30 ? "expiring" : "active";
}

const STATE_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  depleted: "bg-zinc-100 text-zinc-600",
  recalled: "bg-purple-50 text-purple-700",
};

const ADJUSTMENT_LABELS: Record<AdjustmentType, string> = {
  correction: "Stock correction",
  damage: "Damaged",
  expiry_write_off: "Expiry write-off",
  other: "Adjustment",
};

interface TxMeta {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: (tx: StockTransaction) => string;
}

const TX_META: Record<StockTransaction["type"], TxMeta> = {
  receipt: { icon: PackagePlus, color: "text-emerald-600 bg-emerald-50", label: () => "Goods received" },
  sale: { icon: ShoppingCart, color: "text-sky-600 bg-sky-50", label: () => "Retail sale" },
  adjustment: {
    icon: SlidersHorizontal,
    color: "text-amber-600 bg-amber-50",
    label: (tx) => tx.adjustment_type ? ADJUSTMENT_LABELS[tx.adjustment_type] : "Adjustment",
  },
  recall: { icon: AlertOctagon, color: "text-purple-600 bg-purple-50", label: () => "Batch recalled" },
  return: { icon: ArrowUpCircle, color: "text-teal-600 bg-teal-50", label: () => "Customer return" },
};

function BatchMovements({ batchId }: { batchId: string }) {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = subscribeBatchMovements(
      batchId,
      (txs) => { setTransactions(txs); setLoading(false); },
      () => { setError("Could not load movements."); setLoading(false); },
    );
    return unsub;
  }, [batchId]);

  if (loading) {
    return (
      <div className="space-y-2 py-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4">
            <Skeleton className="h-7 w-7 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) return <p className="px-4 py-3 text-xs text-red-600">{error}</p>;

  if (transactions.length === 0) {
    return <p className="px-4 py-3 text-xs text-zinc-500">No movements recorded yet.</p>;
  }

  return (
    <div className="divide-y divide-zinc-100">
      {transactions.map((tx) => {
        const meta = TX_META[tx.type];
        const Icon = meta.icon;
        const isPositive = tx.quantity_change > 0;
        return (
          <div key={tx.id} className="flex gap-3 px-4 py-3">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.color}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-emerald-950">{meta.label(tx)}</p>
                <div className="flex items-center gap-1 shrink-0">
                  {isPositive
                    ? <ArrowUpCircle className="h-3 w-3 text-emerald-600" />
                    : <ArrowDownCircle className="h-3 w-3 text-red-500" />}
                  <span className={`text-xs font-semibold ${isPositive ? "text-emerald-700" : "text-red-600"}`}>
                    {isPositive ? "+" : ""}{number.format(tx.quantity_change)}
                  </span>
                </div>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-zinc-500">{tx.reason}</p>
              <div className="mt-0.5 flex gap-3 text-[10px] text-zinc-400">
                <span>{tsFormat.format(toDate(tx.created_at))}</span>
                <span>·</span>
                <span>Balance: {number.format(tx.quantity_after)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BatchCard({
  batch,
  product,
  expanded,
  onToggle,
}: {
  batch: Batch;
  product: Product | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const state = stockState(batch);
  const utilisation =
    batch.quantity_received > 0
      ? Math.round(((batch.quantity_received - batch.quantity_remaining) / batch.quantity_received) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-4 p-4 text-left hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-emerald-950">{batch.product_name_snapshot}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATE_STYLE[state] ?? "bg-zinc-100 text-zinc-600"}`}>
              {state === "expiring" ? "Expiring soon" : state}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">
            Batch {batch.batch_number}
            {product ? ` · ${product.barcode_primary}` : ""}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-600 md:grid-cols-4">
            <span>Received: <strong>{number.format(batch.quantity_received)}</strong></span>
            <span>Remaining: <strong className={batch.quantity_remaining === 0 ? "text-red-600" : ""}>{number.format(batch.quantity_remaining)}</strong></span>
            <span>Expiry: <strong>{dateFormat.format(toDate(batch.expiry_date))}</strong></span>
            <span>Used: <strong>{utilisation}%</strong></span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-6 text-xs text-zinc-500 md:grid-cols-4">
            <span>Supplier: {batch.supplier_name_snapshot || "—"}</span>
            <span>GRN: {batch.grn_id ? <span className="font-mono">{batch.grn_id.slice(-8).toUpperCase()}</span> : "Manual"}</span>
            <span>Cost: {currency.format(batch.cost_price)}</span>
            <span>Retail: {currency.format(batch.retail_price)}</span>
          </div>
        </div>
        <div className="shrink-0 pt-0.5 text-zinc-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-zinc-100">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
            Movement history
          </p>
          <BatchMovements batchId={batch.id} />
        </div>
      ) : null}
    </div>
  );
}

export function TraceView() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let pending = 2;
    const done = () => { if (--pending === 0) setLoading(false); };
    const unsubscribes: Array<() => void> = [];
    let fallback: ReturnType<typeof setTimeout> | undefined;
    try {
      unsubscribes.push(
        subscribeBatches((b) => { setBatches(b); done(); }, () => { setLoadError("Batches could not be loaded."); done(); }),
        subscribeProducts((p) => { setProducts(p); done(); }, () => done()),
      );
    } catch {
      fallback = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
    }
    return () => {
      unsubscribes.forEach((u) => u());
      if (fallback) clearTimeout(fallback);
    };
  }, []);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return batches;
    return batches.filter((b) => {
      const product = productMap.get(b.product_id);
      return (
        b.batch_number.toLowerCase().includes(term) ||
        b.product_name_snapshot.toLowerCase().includes(term) ||
        product?.barcode_primary.toLowerCase().includes(term) ||
        product?.barcode_internal?.toLowerCase().includes(term) ||
        b.supplier_name_snapshot?.toLowerCase().includes(term)
      );
    });
  }, [batches, search, productMap]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (filtered.length === 1) {
      setExpandedId(filtered[0].id);
    }
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-emerald-900/10 pb-5">
        <p className="text-xs font-semibold uppercase text-lime-700">Batch lookup</p>
        <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Drug Traceability</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Search by batch number, product name, barcode, or supplier to trace the full lifecycle of any batch.
        </p>
      </header>

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="relative">
        <Search className="pointer-events-none absolute left-4 top-3 h-5 w-5 text-zinc-400" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Batch number, product name, barcode, or supplier…"
          className="h-11 w-full rounded-md border border-zinc-300 bg-white pl-12 pr-4 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
        />
      </form>

      {search.trim() ? (
        <p className="text-xs text-zinc-500">
          {filtered.length} batch{filtered.length === 1 ? "" : "es"} match{filtered.length === 1 ? "es" : ""} &ldquo;{search.trim()}&rdquo;
        </p>
      ) : (
        <p className="text-xs text-zinc-500">{batches.length} batches in inventory</p>
      )}

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-2 h-3 w-32" />
              <div className="mt-3 flex gap-6">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-3 w-20" />
                ))}
              </div>
            </div>
          ))
        ) : filtered.length === 0 && search.trim() ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-emerald-900/10 bg-white px-4 text-center shadow-sm">
            <PackageSearch className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No batches found</p>
            <p className="mt-1 text-sm text-zinc-500">
              Try the batch number, product name, or barcode.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-emerald-900/10 bg-white px-4 text-center shadow-sm">
            <PackageSearch className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">Search to trace a batch</p>
            <p className="mt-1 text-sm text-zinc-500">
              Enter a batch number, product name, or barcode above.
            </p>
          </div>
        ) : (
          filtered.slice(0, 50).map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              product={productMap.get(batch.product_id)}
              expanded={expandedId === batch.id}
              onToggle={() => setExpandedId(expandedId === batch.id ? null : batch.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
