"use client";

import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarClock,
  ShoppingCart,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  subscribe7DayRevenue,
  subscribeTodayRetailStats,
  type DayRevenue,
  type TodayStats,
} from "@/lib/services/dashboard.service";
import { subscribeBatches, subscribeProducts } from "@/lib/services/inventory.service";
import { subscribeRecentRetailSales } from "@/lib/services/sales.service";
import type { Batch, FirestoreDate, Product, SaleTransaction } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");

const timeFormat = new Intl.DateTimeFormat("en-GH", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "short",
});

const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", momo: "MoMo", card: "Card", split: "Split" };

function toDate(value: FirestoreDate | undefined): Date {
  if (!value) return new Date();
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

function stockState(batch: Batch, now = new Date()) {
  if (batch.status !== "active") return batch.status;
  if (batch.quantity_remaining <= 0) return "depleted";
  const daysLeft = Math.ceil((toDate(batch.expiry_date).getTime() - now.getTime()) / 86_400_000);
  if (daysLeft <= 0) return "expired";
  return daysLeft <= 30 ? "expiring" : "active";
}

interface LowStockItem {
  product: Product;
  available: number;
}

interface ExpiringBatch {
  id: string;
  product_name_snapshot: string;
  batch_number: string;
  expiry_date: FirestoreDate;
  quantity_remaining: number;
  daysLeft: number;
}

export function DashboardView() {
  const [todayStats, setTodayStats] = useState<TodayStats | null>(null);
  const [revenueWeek, setRevenueWeek] = useState<DayRevenue[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [recentSales, setRecentSales] = useState<SaleTransaction[]>([]);
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    let pending = 5;
    const done = () => { if (--pending === 0) setDataReady(true); };
    const unsubscribes: Array<() => void> = [];
    try {
      unsubscribes.push(
        subscribeTodayRetailStats((s) => { setTodayStats(s); done(); }, () => done()),
        subscribe7DayRevenue((d) => { setRevenueWeek(d); done(); }, () => done()),
        subscribeProducts((p) => { setProducts(p); done(); }, () => done()),
        subscribeBatches((b) => { setBatches(b); done(); }, () => done()),
        subscribeRecentRetailSales((s) => { setRecentSales(s); done(); }, () => done()),
      );
    } catch {
      setTimeout(() => setDataReady(true), 0);
    }
    return () => unsubscribes.forEach((u) => u());
  }, []);

  const now = useMemo(() => new Date(), []);

  const lowStockItems = useMemo((): LowStockItem[] => {
    return products
      .filter((p) => p.is_active && p.reorder_threshold > 0)
      .map((p) => {
        const available = batches
          .filter((b) => b.product_id === p.id && (stockState(b, now) === "active" || stockState(b, now) === "expiring"))
          .reduce((sum, b) => sum + b.quantity_remaining, 0);
        return { product: p, available };
      })
      .filter((item) => item.available < item.product.reorder_threshold)
      .sort((a, b) => a.available - b.available)
      .slice(0, 10);
  }, [products, batches, now]);

  const expiringBatches = useMemo((): ExpiringBatch[] => {
    return batches
      .filter((b) => {
        const state = stockState(b, now);
        return state === "expiring" || state === "expired";
      })
      .map((b) => ({
        ...b,
        daysLeft: Math.ceil((toDate(b.expiry_date).getTime() - now.getTime()) / 86_400_000),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 10);
  }, [batches, now]);

  const weekTotal = revenueWeek.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="space-y-6">
      <header className="border-b border-emerald-900/10 pb-5">
        <p className="text-xs font-semibold uppercase text-lime-700">Operational overview</p>
        <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">Today&apos;s activity and stock health at a glance.</p>
      </header>

      {/* Stats row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's retail sales"
          value={todayStats ? currency.format(todayStats.total) : "—"}
          note={todayStats ? `${todayStats.saleCount} transaction${todayStats.saleCount === 1 ? "" : "s"}` : "Loading…"}
          icon={ShoppingCart}
          loading={!dataReady}
        />
        <StatCard
          label="7-day revenue"
          value={dataReady ? currency.format(weekTotal) : "—"}
          note="All retail channels"
          icon={BarChart3}
          loading={!dataReady}
        />
        <StatCard
          label="Low stock items"
          value={dataReady ? number.format(lowStockItems.length) : "—"}
          note="Below reorder threshold"
          icon={Boxes}
          urgent={lowStockItems.length > 0}
          loading={!dataReady}
        />
        <StatCard
          label="Expiring ≤30 days"
          value={dataReady ? number.format(expiringBatches.filter((b) => b.daysLeft > 0).length) : "—"}
          note="Active batches only"
          icon={CalendarClock}
          urgent={expiringBatches.some((b) => b.daysLeft <= 7)}
          loading={!dataReady}
        />
      </section>

      {/* Revenue chart */}
      <section className="rounded-md border border-emerald-900/10 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-emerald-950">7-day retail revenue</h2>
          <p className="text-xs text-zinc-500">{currency.format(weekTotal)}</p>
        </div>
        {!dataReady ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={revenueWeek} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                width={60}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                }
              />
              <Tooltip
                formatter={(value) => [currency.format(Number(value) || 0), "Revenue"]}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar dataKey="total" fill="#047857" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Recent sales */}
        <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
          <header className="border-b border-emerald-900/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-emerald-950">Recent retail sales</h2>
          </header>
          {!dataReady ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : recentSales.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center text-sm text-zinc-500">
              No sales recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentSales.slice(0, 8).map((sale) => (
                <div key={sale.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-mono text-[11px] text-zinc-400">{sale.id.slice(-10).toUpperCase()}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {timeFormat.format(toDate(sale.sale_date))} · {sale.item_count} item{sale.item_count === 1 ? "" : "s"} · {PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-950">{currency.format(sale.total)}</p>
                    {sale.status === "voided" ? (
                      <p className="text-[10px] text-red-500">Voided</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Low stock + expiring alerts */}
        <div className="space-y-4">
          {lowStockItems.length > 0 ? (
            <section className="overflow-hidden rounded-md border border-amber-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-amber-800">Low stock — {lowStockItems.length} product{lowStockItems.length === 1 ? "" : "s"}</h2>
              </header>
              <div className="divide-y divide-zinc-100">
                {lowStockItems.map(({ product, available }) => (
                  <div key={product.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-emerald-950">{product.name_brand}</p>
                      <p className="text-xs text-zinc-500">{product.name_generic}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-amber-700">{number.format(available)} left</p>
                      <p className="text-xs text-zinc-400">threshold: {number.format(product.reorder_threshold)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {expiringBatches.length > 0 ? (
            <section className="overflow-hidden rounded-md border border-red-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-3">
                <CalendarClock className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-semibold text-red-800">
                  Expiry risk — {expiringBatches.length} batch{expiringBatches.length === 1 ? "" : "es"}
                </h2>
              </header>
              <div className="divide-y divide-zinc-100">
                {expiringBatches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-emerald-950">{b.product_name_snapshot}</p>
                      <p className="font-mono text-xs text-zinc-400">{b.batch_number}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${b.daysLeft <= 0 ? "text-red-600" : b.daysLeft <= 7 ? "text-red-500" : "text-amber-600"}`}>
                        {b.daysLeft <= 0 ? "Expired" : `${b.daysLeft}d left`}
                      </p>
                      <p className="text-xs text-zinc-400">{number.format(b.quantity_remaining)} units</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {dataReady && lowStockItems.length === 0 && expiringBatches.length === 0 ? (
            <div className="rounded-md border border-emerald-900/10 bg-white p-6 text-center shadow-sm">
              <p className="text-sm font-medium text-emerald-700">Stock health looks good</p>
              <p className="mt-1 text-xs text-zinc-500">No low-stock or expiry alerts today.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  urgent = false,
  loading = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
  urgent?: boolean;
  loading?: boolean;
}) {
  return (
    <article className={`rounded-md border bg-white p-4 shadow-sm ${urgent ? "border-amber-300" : "border-emerald-900/10"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
        <Icon className={`h-4 w-4 ${urgent ? "text-amber-500" : "text-lime-700"}`} />
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-1 h-3 w-20" />
        </>
      ) : (
        <>
          <p className="mt-3 text-2xl font-semibold text-emerald-950">{value}</p>
          <p className="mt-1 text-sm text-zinc-500">{note}</p>
        </>
      )}
    </article>
  );
}
