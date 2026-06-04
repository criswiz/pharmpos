"use client";

import { Banknote, CreditCard, Loader2, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { getSaleLineItems, returnSaleItems } from "@/lib/services/sales.service";
import type { SaleLineItem, SinglePaymentMethod } from "@/types";

const ghsCurrency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });

interface Actor {
  uid: string;
  name: string;
  role: string;
}

interface Props {
  saleId: string;
  actor: Actor;
  onClose: () => void;
}

const REFUND_METHODS: Array<{ value: SinglePaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "momo", label: "MoMo", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
];

export function ReturnModal({ saleId, actor, onClose }: Props) {
  const { toast } = useToast();
  const [lineItems, setLineItems] = useState<SaleLineItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<SinglePaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    getSaleLineItems(saleId)
      .then((items) => {
        setLineItems(items);
        setQuantities(Object.fromEntries(items.map((item) => [item.id, 0])));
        setLoading(false);
      })
      .catch(() => {
        setLoadError("Could not load sale items. Check your connection and try again.");
        setLoading(false);
      });
  }, [saleId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const returnLines = lineItems
    .filter((item) => (quantities[item.id] ?? 0) > 0)
    .map((item) => {
      const qty = quantities[item.id] ?? 0;
      return {
        sale_line_item_id: item.id,
        product_id: item.product_id,
        product_name_snapshot: item.product_name_snapshot,
        batch_id: item.batch_id,
        batch_number_snapshot: item.batch_number_snapshot,
        quantity_returned: qty,
        unit_price: item.unit_price,
        line_total: Math.round((qty * item.unit_price + Number.EPSILON) * 100) / 100,
      };
    });

  const totalRefund = returnLines.reduce((sum, l) => sum + l.line_total, 0);
  const hasItems = returnLines.length > 0;

  async function handleSubmit() {
    setSubmitError("");
    setSubmitting(true);
    try {
      await returnSaleItems(saleId, returnLines, refundMethod, notes, actor);
      toast({
        title: "Return processed",
        description: `${ghsCurrency.format(totalRefund)} refunded via ${REFUND_METHODS.find((m) => m.value === refundMethod)?.label}.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Return could not be processed.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Process return"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Inventory restored on save</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Process return</h2>
            <p className="mt-0.5 font-mono text-xs text-zinc-400">Sale {saleId.slice(-12).toUpperCase()}</p>
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
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-10 w-20" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <p className="m-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {lineItems.map((item) => {
                const qty = quantities[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-emerald-950 truncate">
                        {item.product_name_snapshot}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                        Batch {item.batch_number_snapshot} · {ghsCurrency.format(item.unit_price)} each
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        of {item.quantity}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        step="1"
                        value={qty}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(item.quantity, Number(e.target.value) || 0));
                          setQuantities((prev) => ({ ...prev, [item.id]: v }));
                        }}
                        className="h-9 w-16 rounded-md border border-zinc-300 px-2 text-center text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      />
                    </div>
                    <div className="w-20 shrink-0 text-right">
                      {qty > 0 ? (
                        <span className="text-sm font-semibold text-emerald-900">
                          {ghsCurrency.format(qty * item.unit_price)}
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-300">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !loadError ? (
            <div className="space-y-4 border-t border-zinc-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-600">Refund total</p>
                <p className="text-lg font-semibold text-emerald-950">
                  {ghsCurrency.format(totalRefund)}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase text-zinc-500">Refund method</p>
                <div className="grid grid-cols-3 gap-2">
                  {REFUND_METHODS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRefundMethod(value)}
                      className={`flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium ${
                        refundMethod === value
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block text-sm font-medium text-emerald-950">
                Notes (optional)
                <input
                  type="text"
                  placeholder="Reason for return"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </label>

              {submitError ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasItems || submitting || loading}
            onClick={handleSubmit}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              `Refund ${hasItems ? ghsCurrency.format(totalRefund) : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
