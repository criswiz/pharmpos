"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertOctagon, Boxes, CalendarClock, History, PackagePlus, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { BatchMovementsPanel } from "@/components/inventory/batch-movements-panel";
import { StockAdjustModal } from "@/components/inventory/stock-adjust-modal";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  receiveBatch,
  subscribeBatches,
  subscribeProducts,
} from "@/lib/services/inventory.service";
import { canAccess } from "@/lib/utils/rbac";
import {
  batchReceiptSchema,
  type BatchReceiptInput,
} from "@/lib/validation/batch";
import type { Batch, FirestoreDate, Product } from "@/types";

type ActiveModal =
  | { type: "adjust"; batch: Batch }
  | { type: "recall"; batch: Batch }
  | { type: "history"; batch: Batch }
  | null;

type StockState = "active" | "expiring" | "expired" | "depleted" | "recalled";
type StockFilter = "all" | StockState;

const currency = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
});
const number = new Intl.NumberFormat("en-GH");

function inputDateToday() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

const receiptDefaults: BatchReceiptInput = {
  product_id: "",
  batch_number: "",
  supplier_id: "",
  supplier_name_snapshot: "",
  purchase_date: inputDateToday(),
  manufacture_date: "",
  expiry_date: "",
  quantity_received: 1,
  cost_price: 0,
  retail_price: 0,
  wholesale_price: 0,
  shop_context: "shared",
  grn_id: "",
};

function toDate(value: FirestoreDate) {
  return value instanceof Date ? value : value.toDate();
}

function formatDate(value: FirestoreDate) {
  return new Intl.DateTimeFormat("en-GH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(toDate(value));
}

function stockState(batch: Batch): StockState {
  if (batch.status !== "active") {
    return batch.status;
  }

  if (batch.quantity_remaining <= 0) {
    return "depleted";
  }

  const daysUntilExpiry = Math.ceil(
    (toDate(batch.expiry_date).getTime() - Date.now()) / 86_400_000,
  );

  if (daysUntilExpiry <= 0) {
    return "expired";
  }

  return daysUntilExpiry <= 30 ? "expiring" : "active";
}

const statusStyles: Record<StockState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  depleted: "bg-zinc-100 text-zinc-600",
  recalled: "bg-purple-50 text-purple-700",
};

export function BatchStock() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockFilter>("all");
  const [shopContext, setShopContext] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [pendingLoads, setPendingLoads] = useState(2);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const unsubscribes: Array<() => void> = [];
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    const completeLoad = () => setPendingLoads((current) => Math.max(0, current - 1));
    const handleError = (message: string) => {
      setLoadError(message);
      toast({ title: "Could not load inventory", description: message, variant: "error" });
      completeLoad();
    };

    try {
      unsubscribes.push(
        subscribeBatches(
          (nextBatches) => {
            setBatches(nextBatches);
            completeLoad();
          },
          () => handleError("Batches could not be loaded. Check Firestore access and indexes."),
        ),
        subscribeProducts(
          (nextProducts) => {
            setProducts(nextProducts);
            completeLoad();
          },
          () => handleError("Products could not be loaded. Check Firestore access and indexes."),
        ),
      );
    } catch {
      fallbackTimer = setTimeout(() => {
        const message = "Add Firebase credentials to .env.local to connect inventory.";
        setLoadError(message);
        setPendingLoads(0);
        toast({ title: "Firebase is not configured", description: message, variant: "error" });
      }, 0);
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
    };
  }, [toast]);

  const filteredBatches = useMemo(() => {
    const term = search.trim().toLowerCase();

    return batches.filter((batch) => {
      const state = stockState(batch);
      const matchesSearch =
        !term ||
        batch.product_name_snapshot.toLowerCase().includes(term) ||
        batch.batch_number.toLowerCase().includes(term) ||
        batch.supplier_name_snapshot?.toLowerCase().includes(term);
      const matchesStatus = status === "all" || state === status;
      const matchesShop = shopContext === "all" || batch.shop_context === shopContext;

      return matchesSearch && matchesStatus && matchesShop;
    });
  }, [batches, search, shopContext, status]);

  const stockSummary = useMemo(() => {
    return batches.reduce(
      (summary, batch) => {
        const state = stockState(batch);

        if (state === "active" || state === "expiring") {
          summary.sellableUnits += batch.quantity_remaining;
          summary.stockValue += batch.quantity_remaining * batch.cost_price;
        }
        if (state === "expiring") {
          summary.expiringBatches += 1;
        }
        if (state === "expired") {
          summary.expiredBatches += 1;
        }

        return summary;
      },
      { sellableUnits: 0, stockValue: 0, expiringBatches: 0, expiredBatches: 0 },
    );
  }, [batches]);

  const loading = pendingLoads > 0;
  const activeProducts = products.filter((product) => product.is_active);
  const actor =
    user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;
  const canManage = canAccess(role, "inventory:write");

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Inventory</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Batches & Stock</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Receive batches and monitor sellable stock, expiry risk, prices, and source references.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={activeProducts.length === 0}
          className="flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PackagePlus className="h-4 w-4" />
          Receive batch
        </button>
      </header>

      <InventoryNav />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StockStat
          label="Sellable units"
          value={number.format(stockSummary.sellableUnits)}
          note="Active and expiring stock"
          icon={Boxes}
        />
        <StockStat
          label="Stock value"
          value={currency.format(stockSummary.stockValue)}
          note="At current cost price"
          icon={Boxes}
        />
        <StockStat
          label="Expiring in 30 days"
          value={number.format(stockSummary.expiringBatches)}
          note="Batches requiring attention"
          icon={CalendarClock}
        />
        <StockStat
          label="Expired batches"
          value={number.format(stockSummary.expiredBatches)}
          note="Excluded from sellable stock"
          icon={TriangleAlert}
        />
      </section>

      {activeProducts.length === 0 && !loading ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add an active product before receiving stock.
        </p>
      ) : null}

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-[1fr_190px_190px_auto]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, batch, or supplier"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </label>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StockFilter)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
          <option value="depleted">Depleted</option>
          <option value="recalled">Recalled</option>
        </select>
        <select
          value={shopContext}
          onChange={(event) => setShopContext(event.target.value)}
          className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        >
          <option value="all">All stock pools</option>
          <option value="shared">Shared</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filteredBatches.length} batches
        </div>
      </section>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-300 border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">Product / Batch</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Expiry</th>
                <th className="px-4 py-3 font-semibold">Remaining</th>
                <th className="px-4 py-3 font-semibold">Cost</th>
                <th className="px-4 py-3 font-semibold">Retail</th>
                <th className="px-4 py-3 font-semibold">Wholesale</th>
                <th className="px-4 py-3 font-semibold">Pool</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? <BatchRowsSkeleton /> : null}
              {!loading
                ? filteredBatches.map((batch) => {
                    const state = stockState(batch);

                    return (
                      <tr key={batch.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-emerald-950">
                            {batch.product_name_snapshot}
                          </p>
                          <p className="font-mono text-xs text-zinc-500">{batch.batch_number}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">
                          <p>{batch.supplier_name_snapshot || "Not recorded"}</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {batch.grn_id ? `GRN: ${batch.grn_id}` : "Manual receipt"}
                            {" | "}
                            {formatDate(batch.purchase_date)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{formatDate(batch.expiry_date)}</td>
                        <td className="px-4 py-3 text-zinc-700">
                          {number.format(batch.quantity_remaining)}
                          <span className="text-xs text-zinc-400">
                            {" / "}
                            {number.format(batch.quantity_received)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-700">{currency.format(batch.cost_price)}</td>
                        <td className="px-4 py-3 text-zinc-700">{currency.format(batch.retail_price)}</td>
                        <td className="px-4 py-3 text-zinc-700">
                          {currency.format(batch.wholesale_price)}
                        </td>
                        <td className="px-4 py-3 capitalize text-zinc-700">{batch.shop_context}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusStyles[state]}`}
                          >
                            {state === "expiring" ? "Expiring soon" : state}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {canManage && (state === "active" || state === "expiring") ? (
                              <button
                                type="button"
                                title="Adjust stock"
                                onClick={() => setActiveModal({ type: "adjust", batch })}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            {canManage && batch.status !== "recalled" && batch.status !== "depleted" ? (
                              <button
                                type="button"
                                title="Recall batch"
                                onClick={() => setActiveModal({ type: "recall", batch })}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
                              >
                                <AlertOctagon className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              title="Movement history"
                              onClick={() => setActiveModal({ type: "history", batch })}
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                : null}
            </tbody>
          </table>
        </div>

        {!loading && filteredBatches.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
            <Boxes className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No batches found</p>
            <p className="mt-1 max-w-sm text-sm text-zinc-500">
              Receive the first batch or adjust the current stock filters.
            </p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <BatchReceiptForm
          products={activeProducts}
          actor={actor}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      {activeModal?.type === "adjust" && actor ? (
        <StockAdjustModal
          mode="adjust"
          batch={activeModal.batch}
          actor={actor}
          onClose={() => setActiveModal(null)}
        />
      ) : null}

      {activeModal?.type === "recall" && actor ? (
        <StockAdjustModal
          mode="recall"
          batch={activeModal.batch}
          actor={actor}
          onClose={() => setActiveModal(null)}
        />
      ) : null}

      {activeModal?.type === "history" ? (
        <BatchMovementsPanel
          batch={activeModal.batch}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
    </div>
  );
}

function BatchReceiptForm({
  products,
  actor,
  onClose,
}: {
  products: Product[];
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<BatchReceiptInput>({
    resolver: zodResolver(batchReceiptSchema),
    defaultValues: receiptDefaults,
  });
  const selectedProductId = useWatch({ control, name: "product_id" });
  const selectedProduct = products.find((product) => product.id === selectedProductId);

  async function onSubmit(input: BatchReceiptInput) {
    setSubmitError("");

    if (!actor || !selectedProduct) {
      const message = "Your profile and a valid product are required before receiving stock.";
      setSubmitError(message);
      toast({ title: "Batch not received", description: message, variant: "error" });
      return;
    }

    try {
      await receiveBatch(input, selectedProduct, actor);
      toast({
        title: "Batch received",
        description: `${input.quantity_received} units of ${selectedProduct.name_brand} were added to stock.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("already exists")
        ? rawMessage
        : rawMessage.includes("offline")
          ? "Batch could not be received because Firestore is offline."
          : "Batch could not be received. Check Firebase permissions and try again.";
      setSubmitError(message);
      toast({ title: "Batch not received", description: message, variant: "error" });
    }
  }

  const fieldClass =
    "mt-1 h-10 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-xl"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-900/10 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Inventory receipt</p>
            <h2 className="mt-1 text-lg font-semibold text-emerald-950">Receive batch</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 hover:bg-zinc-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
          <Field label="Product" error={errors.product_id?.message}>
            <select className={fieldClass} {...register("product_id")}>
              <option value="">Select product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name_brand} ({product.name_generic})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Batch number" error={errors.batch_number?.message}>
            <input className={fieldClass} {...register("batch_number")} />
          </Field>
          <Field label="Supplier name" error={errors.supplier_name_snapshot?.message}>
            <input className={fieldClass} {...register("supplier_name_snapshot")} />
          </Field>
          <Field label="Supplier reference / ID" error={errors.supplier_id?.message}>
            <input className={fieldClass} {...register("supplier_id")} />
          </Field>
          <Field label="Purchase date" error={errors.purchase_date?.message}>
            <input type="date" className={fieldClass} {...register("purchase_date")} />
          </Field>
          <Field label="Manufacture date" error={errors.manufacture_date?.message}>
            <input type="date" className={fieldClass} {...register("manufacture_date")} />
          </Field>
          <Field label="Expiry date" error={errors.expiry_date?.message}>
            <input type="date" className={fieldClass} {...register("expiry_date")} />
          </Field>
          <Field label="Quantity received" error={errors.quantity_received?.message}>
            <input
              type="number"
              min="1"
              step="1"
              className={fieldClass}
              {...register("quantity_received", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Cost price (GHS)" error={errors.cost_price?.message}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={fieldClass}
              {...register("cost_price", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Retail price (GHS)" error={errors.retail_price?.message}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={fieldClass}
              {...register("retail_price", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Wholesale price (GHS)" error={errors.wholesale_price?.message}>
            <input
              type="number"
              min="0"
              step="0.01"
              className={fieldClass}
              {...register("wholesale_price", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Stock pool" error={errors.shop_context?.message}>
            <select className={fieldClass} {...register("shop_context")}>
              <option value="shared">Shared</option>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </Field>
          <Field label="GRN reference (optional)" error={errors.grn_id?.message}>
            <input className={fieldClass} {...register("grn_id")} />
          </Field>
        </div>

        {submitError ? (
          <p className="mx-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</p>
        ) : null}

        <footer className="mt-5 flex justify-end gap-3 border-t border-emerald-900/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-10 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-70"
          >
            {isSubmitting ? "Receiving..." : "Receive batch"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function StockStat({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <article className="rounded-md border border-emerald-900/10 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
        <Icon className="h-4 w-4 text-lime-700" />
      </div>
      <p className="mt-3 text-2xl font-semibold text-emerald-950">{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{note}</p>
    </article>
  );
}

function BatchRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index}>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-2 h-3 w-24" />
          </td>
          {Array.from({ length: 9 }).map((__, cellIndex) => (
            <td key={cellIndex} className="px-4 py-3">
              <Skeleton className="h-4 w-20" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-medium text-emerald-950">
      {label}
      {children}
      {error ? <span className="mt-1 block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}
