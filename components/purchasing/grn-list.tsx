"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Minus, PackagePlus, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { PurchasingNav } from "@/components/purchasing/purchasing-nav";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/hooks/useAuth";
import { createGrn, subscribeGrns } from "@/lib/services/purchasing.service";
import { subscribeProducts } from "@/lib/services/inventory.service";
import { subscribeSuppliers } from "@/lib/services/supplier.service";
import { grnSchema, type GrnInput } from "@/lib/validation/grn";
import type { FirestoreDate, GoodsReceivedNote, Product, Supplier } from "@/types";

const currency = new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" });
const number = new Intl.NumberFormat("en-GH");

function inputDateToday() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function formatDate(value: FirestoreDate) {
  const d = typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
  return new Intl.DateTimeFormat("en-GH", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

const LINE_DEFAULTS = {
  product_id: "",
  batch_number: "",
  manufacture_date: "",
  expiry_date: "",
  quantity_received: 1,
  cost_price: 0,
  retail_price: 0,
  wholesale_price: 0,
  shop_context: "shared" as const,
};

export function GrnList() {
  const { user, appUser, role } = useAuth();
  const { toast } = useToast();
  const [grns, setGrns] = useState<GoodsReceivedNote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const actor = user && appUser && role ? { uid: user.uid, name: appUser.name, role } : null;

  useEffect(() => {
    let pending = 3;
    const done = () => { if (--pending === 0) setLoading(false); };
    const unsubscribes: Array<() => void> = [];
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      unsubscribes.push(
        subscribeGrns((data) => { setGrns(data); done(); }, () => { setLoadError("GRNs could not be loaded."); done(); }),
        subscribeProducts((data) => { setProducts(data); done(); }, () => { done(); }),
        subscribeSuppliers((data) => { setSuppliers(data); done(); }, () => { done(); }),
      );
    } catch {
      fallbackTimer = setTimeout(() => {
        setLoadError("Add Firebase credentials to .env.local.");
        setLoading(false);
      }, 0);
    }
    return () => {
      unsubscribes.forEach((u) => u());
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return grns.filter((g) =>
      !term ||
      g.grn_number.toLowerCase().includes(term) ||
      g.supplier_name_snapshot?.toLowerCase().includes(term),
    );
  }, [grns, search]);

  const activeProducts = products.filter((p) => p.is_active);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-emerald-900/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-lime-700">Purchasing</p>
          <h1 className="mt-1 text-2xl font-semibold text-emerald-950">Goods Received</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Record incoming stock. Each GRN creates batches and opening stock movements atomically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          disabled={activeProducts.length === 0}
          className="flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          <PackagePlus className="h-4 w-4" />
          Receive goods
        </button>
      </header>

      <PurchasingNav />

      {loadError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      ) : null}
      {activeProducts.length === 0 && !loading ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add at least one active product before receiving goods.
        </p>
      ) : null}

      <div className="flex gap-3">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GRN number or supplier"
            className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
          />
        </label>
        <div className="flex h-10 items-center rounded-md border border-emerald-900/10 bg-white px-3 text-sm text-zinc-600">
          {filtered.length} GRNs
        </div>
      </div>

      <section className="overflow-hidden rounded-md border border-emerald-900/10 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] border-collapse text-left text-sm">
            <thead className="bg-emerald-50 text-xs uppercase text-emerald-950">
              <tr>
                <th className="px-4 py-3 font-semibold">GRN #</th>
                <th className="px-4 py-3 font-semibold">Date received</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">PO ref</th>
                <th className="px-4 py-3 font-semibold">Lines</th>
                <th className="px-4 py-3 font-semibold">Total cost</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                : filtered.map((grn) => (
                    <tr key={grn.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono font-semibold text-emerald-950">{grn.grn_number}</td>
                      <td className="px-4 py-3 text-zinc-700">{formatDate(grn.received_date)}</td>
                      <td className="px-4 py-3 text-zinc-700">{grn.supplier_name_snapshot || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-500">{grn.po_number_snapshot || "—"}</td>
                      <td className="px-4 py-3 text-zinc-700">{number.format(grn.lines.length)}</td>
                      <td className="px-4 py-3 text-zinc-700">{currency.format(grn.total_value)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                          Completed
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 text-center">
            <ClipboardList className="h-8 w-8 text-lime-600" />
            <p className="mt-3 text-sm font-semibold text-emerald-950">No goods received yet</p>
            <p className="mt-1 text-sm text-zinc-500">Use the &ldquo;Receive goods&rdquo; button to record incoming stock.</p>
          </div>
        ) : null}
      </section>

      {formOpen ? (
        <GrnForm
          products={activeProducts}
          suppliers={suppliers}
          actor={actor}
          onClose={() => setFormOpen(false)}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

function GrnForm({
  products,
  suppliers,
  actor,
  onClose,
  toast,
}: {
  products: Product[];
  suppliers: Supplier[];
  actor: { uid: string; name: string; role: string } | null;
  onClose: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GrnInput>({
    resolver: zodResolver(grnSchema),
    defaultValues: {
      supplier_id: "",
      supplier_name_snapshot: "",
      po_id: "",
      po_number_snapshot: "",
      received_date: inputDateToday(),
      notes: "",
      lines: [{ ...LINE_DEFAULTS }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const watchedLines = useWatch({ control, name: "lines" });

  const totalCost = useMemo(
    () => (watchedLines ?? []).reduce(
      (sum, l) => sum + (l.quantity_received || 0) * (l.cost_price || 0),
      0,
    ),
    [watchedLines],
  );

  const activeSuppliers = suppliers.filter((s) => s.is_active);

  async function onSubmit(input: GrnInput) {
    setSubmitError("");
    if (!actor) { setSubmitError("Your profile is required."); return; }
    try {
      const { grnNumber } = await createGrn(input, products, actor);
      toast({
        title: `GRN ${grnNumber} created`,
        description: `${input.lines.length} batch${input.lines.length === 1 ? "" : "es"} added to inventory.`,
        variant: "success",
      });
      onClose();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "GRN could not be created.";
      setSubmitError(msg);
    }
  }

  const fc = "mt-1 h-9 w-full rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase text-lime-700">Purchasing</p>
            <h2 className="mt-0.5 text-base font-semibold text-emerald-950">Receive goods</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Header fields */}
          <div className="grid gap-x-5 gap-y-4 border-b border-zinc-100 p-5 md:grid-cols-3">
            <label className="text-sm font-medium text-emerald-950">
              Received date *
              <input type="date" className={fc} {...register("received_date")} />
              {errors.received_date ? <span className="mt-1 block text-xs font-normal text-red-600">{errors.received_date.message}</span> : null}
            </label>
            <label className="text-sm font-medium text-emerald-950">
              Supplier
              <select
                className={fc}
                {...register("supplier_id")}
                onChange={(e) => {
                  const sup = activeSuppliers.find((s) => s.id === e.target.value);
                  const form = e.target.form;
                  if (form) {
                    const snapshotInput = form.querySelector<HTMLInputElement>('[name="supplier_name_snapshot"]');
                    if (snapshotInput) snapshotInput.value = sup?.name ?? "";
                  }
                }}
              >
                <option value="">— No supplier —</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input type="hidden" {...register("supplier_name_snapshot")} />
            </label>
            <label className="text-sm font-medium text-emerald-950">
              PO reference (optional)
              <input className={fc} placeholder="PO-2026-001" {...register("po_number_snapshot")} />
              <input type="hidden" {...register("po_id")} />
            </label>
            <div className="md:col-span-3">
              <label className="text-sm font-medium text-emerald-950">
                Notes
                <input className={fc} {...register("notes")} />
              </label>
            </div>
          </div>

          {/* Line items */}
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-950">Line items</h3>
              <button
                type="button"
                onClick={() => append({ ...LINE_DEFAULTS })}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                <Plus className="h-3.5 w-3.5" />
                Add line
              </button>
            </div>

            {typeof errors.lines === "object" && "message" in errors.lines ? (
              <p className="mb-3 text-xs text-red-600">{(errors.lines as { message?: string }).message}</p>
            ) : null}

            <div className="space-y-4">
              {fields.map((field, i) => {
                const lineErrors = errors.lines?.[i];
                return (
                  <div key={field.id} className="rounded-md border border-zinc-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-500">Line {i + 1}</span>
                      {fields.length > 1 ? (
                        <button type="button" onClick={() => remove(i)} className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-red-50 hover:text-red-600">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-x-4 gap-y-3 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <label className="text-xs font-medium text-emerald-950">
                          Product *
                          <select className={fc} {...register(`lines.${i}.product_id`)}>
                            <option value="">Select product</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>{p.name_brand} ({p.name_generic})</option>
                            ))}
                          </select>
                          {lineErrors?.product_id ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.product_id.message}</span> : null}
                        </label>
                      </div>
                      <label className="text-xs font-medium text-emerald-950">
                        Batch number *
                        <input className={fc} placeholder="e.g. BN-2026-A" {...register(`lines.${i}.batch_number`)} />
                        {lineErrors?.batch_number ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.batch_number.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Qty received *
                        <input type="number" min="1" step="1" className={fc} {...register(`lines.${i}.quantity_received`, { valueAsNumber: true })} />
                        {lineErrors?.quantity_received ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.quantity_received.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Expiry date *
                        <input type="date" className={fc} {...register(`lines.${i}.expiry_date`)} />
                        {lineErrors?.expiry_date ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.expiry_date.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Manufacture date
                        <input type="date" className={fc} {...register(`lines.${i}.manufacture_date`)} />
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Cost price (GHS) *
                        <input type="number" min="0" step="0.01" className={fc} {...register(`lines.${i}.cost_price`, { valueAsNumber: true })} />
                        {lineErrors?.cost_price ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.cost_price.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Retail price (GHS) *
                        <input type="number" min="0" step="0.01" className={fc} {...register(`lines.${i}.retail_price`, { valueAsNumber: true })} />
                        {lineErrors?.retail_price ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.retail_price.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Wholesale price (GHS) *
                        <input type="number" min="0" step="0.01" className={fc} {...register(`lines.${i}.wholesale_price`, { valueAsNumber: true })} />
                        {lineErrors?.wholesale_price ? <span className="mt-0.5 block text-xs text-red-600">{lineErrors.wholesale_price.message}</span> : null}
                      </label>
                      <label className="text-xs font-medium text-emerald-950">
                        Stock pool *
                        <select className={fc} {...register(`lines.${i}.shop_context`)}>
                          <option value="shared">Shared</option>
                          <option value="retail">Retail</option>
                          <option value="wholesale">Wholesale</option>
                        </select>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-zinc-100 px-5 py-4">
          <div className="text-sm text-zinc-600">
            Total cost: <span className="font-semibold text-emerald-950">{currency.format(totalCost)}</span>
            {submitError ? <span className="ml-4 text-red-600">{submitError}</span> : null}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="h-10 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="h-10 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {isSubmitting ? "Saving…" : `Receive ${fields.length} batch${fields.length === 1 ? "" : "es"}`}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
