"use client";

import {
  AlertOctagon,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  PackagePlus,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { subscribeBatchMovements } from "@/lib/services/inventory.service";
import type { AdjustmentType, Batch, StockTransaction } from "@/types";

const number = new Intl.NumberFormat("en-GH");
const dateFormat = new Intl.DateTimeFormat("en-GH", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function toDate(value: StockTransaction["created_at"]) {
  if (!value) return new Date();
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  correction: "Correction",
  damage: "Damage",
  expiry_write_off: "Expiry write-off",
  other: "Other",
};

interface TxMeta {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: (tx: StockTransaction) => string;
}

const TX_META: Record<StockTransaction["type"], TxMeta> = {
  receipt: {
    icon: PackagePlus,
    iconClass: "text-emerald-600 bg-emerald-50",
    label: () => "Goods received",
  },
  sale: {
    icon: ShoppingCart,
    iconClass: "text-sky-600 bg-sky-50",
    label: () => "Retail sale",
  },
  adjustment: {
    icon: SlidersHorizontal,
    iconClass: "text-amber-600 bg-amber-50",
    label: (tx) =>
      tx.adjustment_type
        ? ADJUSTMENT_TYPE_LABELS[tx.adjustment_type]
        : "Stock adjustment",
  },
  recall: {
    icon: AlertOctagon,
    iconClass: "text-purple-600 bg-purple-50",
    label: () => "Batch recalled",
  },
};

interface Props {
  batch: Batch;
  onClose: () => void;
}

export function BatchMovementsPanel({ batch, onClose }: Props) {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeBatchMovements(
      batch.id,
      (txs) => {
        setTransactions(txs);
        setLoading(false);
      },
      () => {
        setError("Could not load movement history. Check Firestore access and indexes.");
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [batch.id]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/30" aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Batch movement history"
        className="relative z-10 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Inventory audit</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Movement history</h2>
            <p className="mt-1 text-sm font-medium text-zinc-700">{batch.product_name_snapshot}</p>
            <p className="font-mono text-xs text-zinc-400">Batch {batch.batch_number}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-0 divide-y divide-zinc-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-5 py-4">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          ) : error ? (
            <p className="m-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : transactions.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
              <History className="h-8 w-8 text-lime-600" />
              <p className="mt-3 text-sm font-semibold text-emerald-950">No movements yet</p>
              <p className="mt-1 text-sm text-zinc-500">
                Stock transactions will appear here once they occur.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {transactions.map((tx) => {
                const meta = TX_META[tx.type];
                const Icon = meta.icon;
                const isPositive = tx.quantity_change > 0;

                return (
                  <div key={tx.id} className="flex gap-3 px-5 py-4">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-emerald-950">
                          {meta.label(tx)}
                        </p>
                        <div className="flex items-center gap-1 shrink-0">
                          {isPositive ? (
                            <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ArrowDownCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                          <span
                            className={`text-sm font-semibold ${
                              isPositive ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            {isPositive ? "+" : ""}
                            {number.format(tx.quantity_change)}
                          </span>
                        </div>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 truncate">{tx.reason}</p>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-zinc-400">
                        <span>{dateFormat.format(toDate(tx.created_at))}</span>
                        <span>·</span>
                        <span>Balance: {number.format(tx.quantity_after)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
